exports.attach = function (options) {
  var app = this;

  // Load required libraries.
  var _ = require('underscore');
  var $ = require('cheerio');
  var async = require('async');
  var express = require('express');
  var fs = require('fs');
  var gzippo = require('gzippo');
  var hulk = require('hulk-hogan');
  var im = require('imagemagick');
  var hash = require('mhash').hash;
  var mongoStore = require('connect-mongo')(express);
  var mongoose = require('mongoose');

  this.middleware = {
    /**
     * Authentication middleware.
     */
    restricted: function(req, res, next) {
      if (req.session.user) {
        next();
      }
      else {
        res.statusCode = 403;
        res.end("Access denied");
      }
    },

    /**
     * Session middleware.
     */
    session: function(req, res, next) {
      if (req.session.user) {
        app.user.findById(req.session.user._id, function(err, user) {
          // Updates the user object, since it may have changed.
          req.session.user = user;
          next();
        });
      }
      else {
        next();
      }
    },

    /**
     * Middleware for serving cached images.
     */
    imagecache: function(req, res, next) {
      var match = /\/imagecache\/(([\w\d]{24})-([\w\d]{8}))\.jpg/.exec(req.url);

      if (match) {
        var self = this,
          cache_id = match[1], // the whole xxx-xx part
          item_id = match[2], // only item id part
          image_hash = match[3], // only image hash part
          filename = "./imagecache/" + cache_id + ".jpg",
          headers = {
            "Content-Type": "image/jpeg",
            "Cache-Control": "public, max-age=3153600",
            ETag: cache_id
          };

        fs.readFile(filename, function (err, existing_file) {
          if (err) {
            if (err.code == "ENOENT") {
              app.channel.findOne({items: {$elemMatch: {id: new mongoose.Types.ObjectId(item_id)}}}, function(err, channel) {
                if (err) throw err;

                if (channel == null) {
                  console.log("Cache item not found: " + cache_id);
                  res.writeHead(404);
                  res.end("Cache item not found.");
                  return;
                }
                else {
                  for (var i in channel.items) {
                    if (channel.items[i].id == item_id) {
                      var url = channel.items[i].image;
                      break;
                    }
                  }

                  app.download({url: url}, function(err, buffer) {
                    if (err) {
                      console.log("Original unavailable: " + url + " " + cache_id);
                      res.writeHead(404);
                      res.end("Original unavailable: " + url + " " + cache_id);
                      return;
                    }

                    fs.writeFile(filename, buffer, function (err) {
                      if (err) throw err;

                      var convertStart = new Date().getTime();

                      im.convert([filename, "-flatten", "-background", "white", "-resize", "538>", "-format", "jpg", filename], function(err, metadata){
                        if (err) {
                          fs.unlink(filename);
                          res.writeHead(500);
                          res.end("Error generating thumbnail " + cache_id + " from: " + url);
                          console.log("Error generating thumbnail " + cache_id + " from: " + url);
                          return;
                        }
                        else {
                          console.log("Image at " + url + " conveted in: " + app.timer(convertStart) + "ms");

                          fs.readFile(filename, function (err, created_file) {
                            if (err) throw err;
                            console.log("Serving resized version: " + cache_id + " from: " + url);
                            res.writeHead(200, headers);
                            res.end(created_file);
                            return;
                          });
                        }
                      });
                    });
                  });
                }
              });
            }
            else {
              throw err;
            }
          }
          else {
            console.log("Serving existing version: " + cache_id);
            res.writeHead(200, headers);
            res.end(existing_file);
            return;
          }
        });
      }
      else {
        next();
      }
    }
  };

  // Create HTTP server.
  app.httpServer = express.createServer();

  // Create HTTPS server.
  var server = this.httpsServer = express.createServer({
    ca: fs.readFileSync('./ssl/' + app.conf.domain + '/ca.crt'),
    key: fs.readFileSync('./ssl/' + app.conf.domain + '/server.key.nopass'),
    cert: fs.readFileSync('./ssl/' + app.conf.domain + '/server.crt')
  });

  // Set up server middleware and configuration.
  server.register('.hulk', hulk);
  server.use(app.middleware.imagecache);
  server.use(gzippo.staticGzip('./public', {contentTypeMatch: /text|javascript|json/}));
  server.use(express.bodyParser());
  server.use(express.cookieParser());
  server.use(express.session({secret: 'nõude', store: new mongoStore({db: app.conf.db_name})}));
  server.use(app.middleware.session);
  server.set('view engine', 'hulk');
  server.set('views', './views');
  // View cache is enabled by default for production in express, but this messes things up.
  server.set('view cache', false);
  server.use(express.errorHandler({dumpExceptions: true, showStack: true}));
  server.use(gzippo.compress());
  server.use(server.router);

  /**
   * Redirect any HTTP requests to the HTTPS site.
   */
  this.httpServer.get("*", function(req, res) {
    console.log("Reditected user from HTTP");
    res.redirect("https://" + app.conf.domain + req.url);
  });

  /**
   * Render the main application.
   */
  this.renderApp = function(req, res) {
    if (req.session.user) {
      res.render("app", {bodyClass: "app", user: req.session.user});
    }
    else {
      res.render("index");
    }
  }

  /**
   * TODO
   */
  server.get("/", this.renderApp);
  server.get(/^\/channel\/[^\/]+$/, this.renderApp);
  server.get(/^\/channel\/[^\/]+\/(time|score)$/, this.renderApp);

  /**
   * API: return authenticated user information.
   */
  server.get("/api/user", app.middleware.restricted, function(req, res) {
    var user = _.clone(req.session.user);
    delete user.pass;
    res.json(user);
  });

  /**
   * API: return subscriptions for the authenticated users.
   */
  server.get("/api/user/channels", app.middleware.restricted, function(req, res) {
    var channelsObject = {};

    req.session.user.subscribedChannels(function(channels) {
      // Convert dates to timestamps as dates cause problems with different platforms.
      for (var i in channels) {
        for (var j = 0; j < channels[i].items.length; j++) {
          channels[i].items[j].created = channels[i].items[j].created.getTime();
        }

        channels[i].items_added = channels[i].items_added ? channels[i].items_added.getTime() : null;
        channels[i].items_updated = channels[i].items_updated ? channels[i].items_updated.getTime() : null;

        // Return an object keyed by channel id instead of plain array.
        channelsObject[channels[i]._id] = channels[i];
      }

      res.json(channelsObject);
    });
  });

  /**
   * API: send the whole source code of the channel.
   */
  server.get("/api/configure/source/:id", app.middleware.restricted, function(req, res) {
    Channel.findById(req.params.id, function(err, channel) {
      pagetty.request({url: channel.url}, function(err, response, buffer, body) {
        res.send(_.escape(body));
      });
    });
  });

  /**
   * API: send the whole source code of the channel.
   */
  server.get("/api/configure/sample/:id/:selector", app.middleware.restricted, function(req, res) {
    var $ = require('cheerio');

    app.channel.findById(req.params.id, function(err, channel) {
      app.fetch({url: channel.url}, function(err, buffer) {
        var html = $('<div>').append($(buffer.toString()).find(req.params.selector).first().clone()).remove().html();
        app.tidy(html, function(formatted) {
          res.send(_.escape(formatted));
        });
      });
    });
  });

  /**
   * API: Client auto-update call.
   */
  server.get("/api/channel/updates", app.middleware.restricted, function(req, res) {
    req.session.user.getChannelUpdates(JSON.parse(req.param("state")), function(updates) {
      res.json(updates);
    });
  });

  /**
   * API: Get app state.
   */
  server.get("/api/state", app.middleware.restricted, function(req, res) {
    app.state.findOne({user: req.session.user._id}, function(err, state) {
      err ? res.send(err, 400) : ((state && state.data) ? res.json(state.data) : res.json({}));
    });
  });

  /**
   * API: Get app state.
   */
  server.post("/api/state", app.middleware.restricted, function(req, res) {
    app.state.findOne({user: req.session.user._id}, function(err, state) {
      if (err) {
        res.send(err, 400);
      }
      else if (state) {
        state.data = JSON.parse(req.body.data);
        state.save(function(err) {
          err ? res.send(err, 400) : res.send(200);
        });
      }
      else {
        app.state.create({user: req.session.user._id, data: JSON.parse(req.body.data)}, function(err) {
          err ? res.send(err, 400) : res.send(200);
        });
      }
    });
  });

  /**
   * Subscribe user to a site.
   */
  server.get("/subscribe", app.middleware.restricted, function(req, res) {
    res.render("subscribe");
  });

  /**
   * Subscribe user to a site.
   */
  server.post("/subscribe", app.middleware.restricted, function(req, res) {
    req.session.user.subscribe(req.body.url, function(err, channel) {
      err ? res.send(err, 400) : res.json({channel_id: channel._id}, 200);
    });
  });

  /**
   * Update channel subscription information
   */
  server.post("/subscription", app.middleware.restricted, function(req, res) {
    req.session.user.updateSubscription(req.body.channel_id, {name: req.body.name}, function(err) {
      err ? res.send(err, 400) : res.send(200);
    });
  });

  /**
   * Unsubscrbe user from a site.
   */
  server.post("/unsubscribe", app.middleware.restricted, function(req, res) {
    req.session.user.unsubscribe(req.body.channel_id, function(err) {
      err ? res.send(err, 400) : res.send(200);
    });
  });

  /**
   * Save channel configuration.
   */
  server.post("/rules", app.middleware.restricted, function(req, res) {
    //for (var i in rules) {
    //  validator.check(rules[i].item, 'Item selector is always required.').notEmpty();
    //  validator.check(rules[i].target.selector, 'Target selector is always required.').notEmpty();
    //  validator.check(rules[i].target.url_attribute, 'URL attribute is always required.').notEmpty();
    //}

    async.waterfall([
      // Load channel.
      function(next) {
        app.channel.findById(req.body.channel_id, function(err, channel) {
          next(err, channel);
        });
      },
      // Delete existing rules for the domain.
      function(channel, next) {
        app.rule.find({domain: channel.domain}).remove();
        next(null, channel);
      },
      // Recreate rules.
      function(channel, next) {
        for (var i in req.body.rules) {
          req.body.rules[i].domain = channel.domain;
          req.body.rules[i].url = channel.url;
          app.rule.create(req.body.rules[i], console.log);
        }
        next(null, channel);
      },
      // Update channel items.
      function(channel, next) {
        channel.updateItems(true, function(err, channel) {
          next();
        });
      }
    ], function(err) {
      err ? res.json(err, 400) : res.send(200);
    });
  });

  /**
   * Create a rule from a profiler configuration.
   */
  server.post("/rule/create", app.middleware.restricted, function(req, res) {
    async.waterfall([
      // Load channel.
      function(next) {
        app.channel.findById(req.body.channel_id, function(err, channel) {
          next(err, channel);
        });
      },
      // Create new rule.
      function(channel, next) {
        var rule = req.body.rule;

        rule.domain = channel.domain;
        rule.url = channel.url;

        app.rule.create(rule, function(err) {
          next(err, channel);
        });
      },
      // Update channel items.
      function(channel, next) {
        channel.updateItems(true, function(err) {
          next();
        });
      },
    ], function(err) {
      err ? res.json(err, 400) : res.send(200);
    });
  });

  /**
   * Get subscription form.
   */
  server.get("/channel/:id/subscription", app.middleware.restricted, function(req, res) {
    app.channel.findById(req.params.id, function(err, channel) {
      if (err) {
        res.send(500);
      }
      else {
        console.dir(channel._id);
        res.render("subscription", {
          channel: channel,
          subscription: req.session.user.subscriptions[channel._id]
        });
      }
    })
  });

  /**
   * Display the channel profiling page.
   */
  server.get("/channel/:channel/profile", app.middleware.restricted, function(req, res) {
    app.channel.findById(req.params.channel, function(err, channel) {
      if (err) {
        throw err;
      }
      else {
        channel.createProfile(function(err, profile) {
          if (err) {
            throw err;
          }
          else {
            res.render("profile", {channel: channel, subscription: req.session.user.subscriptions[channel._id], profile: profile});
          }
        });
      }
    });
  });

  /**
   * Get new channel form.
   */
  server.get("/channel/:id/rules", app.middleware.restricted, function(req, res) {
    var params = {};

    async.series([
      // Load channel.
      function(callback) {
        app.channel.findById(req.params.id, function(err, channel) {
          if (err) {
            callback(err);
          }
          else {
            params.channel = channel;
            callback();
          }
        })
      },
      // Load rules.
      function(callback) {
        app.rule.find({domain: params.channel.domain}, function(err, rules) {
          params.rules = rules;
          callback();
        });
      }
    // Send response.
    ], function(err) {
      if (err) {
        res.send(500);
      }
      else {
        res.render("rules", {
          channel: params.channel,
          rules: params.rules,
          subscription: req.session.user.subscriptions[params.channel._id]
        });
      }
    });
  });

  /**
   * Log the user in to the system.
   */
  server.post("/signin", function(req, res) {
    app.user.authenticate(req.body.mail, req.body.password, function(err, user) {
      if (err) {
        res.redirect("/");
      }
      else {
        req.session.user = user;
        res.redirect("/");
      }
    });
  });

  /**
   * Log the user out of the system.
   */
  server.get("/signout", function(req, res) {
    delete req.session.user;
    res.redirect('/');
  });

  /**
   * Display sign-up form.
   */
  server.get("/signup", function(req, res) {
    res.render('signup');
  });

  /**
   * Process sign-up request.
   */
  server.post("/signup", function(req, res) {
    app.user.signup(req.body, function(err) {
      err ? res.send(err, 400) : res.send(200);
    });
  });

  /**
   * Display sign-up confirmation page.
   */
  server.get("/signup/verification", function(req, res) {
    res.render('signup_verification');
  });

  /**
   * Activate the user account and log in automatically.
   */
  server.get('/activate/:verification', function(req, res) {
    app.user.findOne({verification: req.params.verification, verified: false}, function(err, user) {
      if (user) {
        user.activate(function(err) {
          if (err) throw err;

          req.session.user = user;
          res.redirect('/');
        });
      }
      else {
        res.redirect('/');
      }
    });
  });

  /**
   * Display sign-up form.
   */
  server.get("/account", app.middleware.restricted, function(req, res) {
    var user = _.clone(req.session.user);

    //user.created = user.created.toString('MMMM');
    res.render('account', {user: user});
  });

  /**
   * Display sign-up form.
   */
  server.get('/account/delete', app.middleware.restricted, function(req, res) {
    req.session.user.remove(function(err) {
      delete req.session.user;
      res.redirect('/');
    });
  });

  /**
   * Display sign-up form.
   */
  server.get('/password', function(req, res) {
    res.render('password');
  });

  /**
   * Display sign-up form.
   */
  server.post('/password', function(req, res) {
    app.user.findOne({mail: req.body.mail}, function(err, user) {
      if (err) throw err;

      if (user) {
        var new_pass = hash('adler32', 'efiwn.ue@WEOJ32' + new Date().getTime());
        user.pass = app.user.hashPassword(user._id, new_pass);
        user.save(function(err) {
          app.mail({to: user.mail, subject: 'A new password has been created', password: new_pass}, 'password');
          res.send(200);
        });
      }
      else {
        // Do not reveal which e-mails are registered.
        res.send(200);
      }
    });
  });

  /**
   * Update account settings.
   */
  server.post("/account", app.middleware.restricted, function(req, res) {
    var validator = app.getValidator();

    validator.check(app.user.hashPassword(req.session.user._id, req.body.existing_pass), 'Existing password is not correct.').equals(req.session.user.pass);
    validator.check(req.body.pass, 'Password must contain at least 6 characters.').len(6);
    validator.check(req.body.pass, 'Passwords do not match.').equals(req.body.pass2);

    if (validator.hasErrors()) {
      res.send(validator.getErrors()[0], 400);
    }
    else {
      req.session.user.pass = app.user.hashPassword(req.session.user._id, req.body.pass);
      req.session.user.save(function(err) {
        if (err) throw err;
        res.send(200);
      });
    }
  });
}

exports.init = function(done) {
  this.httpsServer.listen(8443);
  this.httpServer.listen(8080);
  done();
}