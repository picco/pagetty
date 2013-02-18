exports.attach = function (options) {
  var app = this;

  // Load required libraries.
  var _ = require('underscore');
  var $ = require('cheerio');
  var async = require('async');
  var everyauth = require('everyauth');
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
        console.log(req.method + ': ' + req.url);
        next();
      }
      else {
        console.log('Request to restricted URL [' + req.method + ']: ' + req.url);
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
              app.item.findById(item_id, function(err, item) {
                if (err) throw err;

                if (item == null) {
                  console.log("Source item not found: " + item_id);
                  res.writeHead(404);
                  res.end("Source item not found: " + item_id);
                  return;
                }
                else {
                  app.fetch({url: item.image}, function(err, buffer) {
                    if (err) {
                      console.log("Original unavailable: " + item.image + " " + cache_id);
                      res.writeHead(404);
                      res.end("Original unavailable: " + item.image + " " + cache_id);
                      return;
                    }

                    fs.writeFile(filename, buffer, function (err) {
                      if (err) throw err;

                      var convertStart = new Date().getTime();

                      //im.convert([filename, "-flatten", "-background", "white", "-resize", "538>", "-format", "jpg", filename], function(err, metadata){
                      im.convert([filename, "-flatten", "-strip", "-background", "white", "-resize", "500>", "-gravity",  "Center", "-format", "jpg", filename], function(err, metadata){
                        if (err) {
                          fs.unlink(filename);
                          res.writeHead(500);
                          res.end("Error generating thumbnail " + cache_id + " from: " + item.image);
                          console.log("Error generating thumbnail " + cache_id + " from: " + item.image);
                          return;
                        }
                        else {
                          console.log("Image at " + item.image + " conveted in: " + app.timer(convertStart) + "ms");

                          fs.readFile(filename, function (err, created_file) {
                            if (err) throw err;
                            console.log("Serving resized version: " + cache_id + " from: " + item.image);
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
    ca: fs.readFileSync('./config/ssl/' + app.conf.domain + '/ca.crt'),
    key: fs.readFileSync('./config/ssl/' + app.conf.domain + '/server.key.nopass'),
    cert: fs.readFileSync('./config/ssl/' + app.conf.domain + '/server.crt')
  });

  everyauth.google
    .appId(app.conf.google.clientId)
    .appSecret(app.conf.google.clientSecret)
    .scope(['https://www.googleapis.com/auth/userinfo.email http://www.google.com/reader/api'])
    .handleAuthCallbackError(function(req, res) {
      res.redirect('/');
    })
    .findOrCreateUser(function(session, accessToken, accessTokenExtra, userMetadata) {
      var promise = this.Promise();

      app.user.findOrCreate(userMetadata.email, function (err, user) {
        if (err) {
          promise.fail(err);
        }
        else {
          session.user = user;
          promise.fulfill(user);
        }
      });

      return promise;
    })
    .redirectPath('/');

  everyauth.facebook
    .appId(app.conf.facebook.clientId)
    .appSecret(app.conf.facebook.clientSecret)
    .scope('email')
    .handleAuthCallbackError(function(req, res) {
      res.redirect('/');
    })
    .findOrCreateUser(function(session, accessToken, accessTokenExtra, userMetadata) {
      var promise = this.Promise();
      app.user.findOrCreate(userMetadata.email, function (err, user) {
        if (err) {
          promise.fail(err);
        }
        else {
          session.user = user;
          promise.fulfill(user);
        }
      });

      return promise;
    })
    .redirectPath('/');

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
  server.use(express.errorHandler({dumpExceptions: false, showStack: false}));
  server.use(gzippo.compress());
  server.use(server.router);
  server.use(everyauth.middleware());

  server.dynamicHelpers({
    build: function(req, res) {
      return hash('adler32', process.env.BUILD);
    },
  });

  everyauth.everymodule.userPkey('_id');
  everyauth.everymodule.findUserById(function (user_id, callback) {
    app.user.findById(user_id, callback);
  });

  /**
   * Redirect any HTTP requests to the HTTPS site.
   */
  this.httpServer.get("*", function(req, res) {
    res.redirect("https://" + app.conf.domain + req.url);
  });

  /**
   * Render the main application.
   */
  this.renderApp = function(req, res) {
    var self = this;
    var list = null;
    var user_lists = {all: app.list.all()};
    var render = {};

    if (req.session.user) {
      var variant = req.params.variant ? req.params.variant : 'time';

      async.series([
        function(next) {
          app.list.findOne({user_id: req.session.user._id, _id: req.params.list_id}, function(err, doc) {
            if (doc) {
              list = app.list.prepare(doc, variant);
            }
            else {
              list = app.list.prepare(app.list.all(), variant);
              user_lists.all.active = " active";
            }
            next();
          });
        },
        function(next) {
          app.list.find({user_id: req.session.user._id}).sort({name: "asc"}).execFind(function(err, lists) {
            if (err) console.log(err);

            lists.sort(function(a, b) {
              return b.name < a.name;
            });

            async.forEach(lists, function(list, iterate) {
              list.icon = 'https://s2.googleusercontent.com/s2/favicons?domain=' + list.domain;
              list.active = (req.params.list_id == list._id) ? ' active' : '';
              user_lists[list._id] = list;
              iterate();
            }, function() {
              next();
            });

          });
        },
        function(next) {
          app.item.getListItems(list, req.session.user, variant, 0, function(err, items) {
            render.items = items;
            next();
          });
        },
        function(next) {
          app.item.newCount(req.session.user, function(count) {
            render.new_count = count;
            next();
          });
        },
      ], function(err, callback) {
        render.app_style = req.session.user.narrow ? "app" : "app app-wide";
        render.list = list;
        render.list_json = JSON.stringify(list);
        render.lists = _.toArray(user_lists);
        render.lists_json = JSON.stringify(user_lists);
        render.user = req.session.user;
        render.variant = variant;
        res.render("app", render);
      });
    }
    else {
      res.render("index");
    }
  }

  /**
   * TODO
   */
  server.get("/", this.renderApp);
  server.get("/list/:list_id", app.middleware.restricted, this.renderApp);
  server.get("/list/:list_id/:variant", app.middleware.restricted, this.renderApp);

  /**
   * API: Update the style of the channel.
   */
  server.post("/api/channel/style/:id/:style", app.middleware.restricted, function(req, res) {
    req.session.user.subscriptions[req.params.id].style = req.params.style;
    req.session.user.markModified("subscriptions");
    req.session.user.save(function(err) {
      err ? res.send(500) : res.send(200);
    });
  });

  /**
   * API: send the whole source code of the channel.
   */
  server.get("/api/channel/sample/:id/:selector", app.middleware.restricted, function(req, res) {
    var $ = require('cheerio');

    app.channel.findById(req.params.id, function(err, channel) {
      app.fetch({url: channel.url}, function(err, buffer) {
        var html = $('<div>').append($(buffer.toString()).find(req.params.selector).first().clone()).remove().html();
        app.tidy(html, function(err, formatted) {
          res.send(_.escape(err ? html : formatted));
        });
      });
    });
  });

  /**
   * API: Store the default app style.
   */
  server.get("/api/app/style/:narrow", app.middleware.restricted, function(req, res) {
    req.session.user.narrow = req.params.narrow == 1 ? true : false;
    req.session.user.save(function(err) {
      res.send(200);
    });
  });

  /**
   * API: Load items from client-side.
   */
  server.get("/api/list/:list/:variant", app.middleware.restricted, function(req, res) {
    if (req.params.list == "all") {
      list = app.list.all();

      app.item.getListItems(list, req.session.user, req.params.variant, 0, function(err, items) {
        res.render("list", {items: items, list: app.list.prepare(list, req.params.variant), layout: false});
      });
    }
    else {
      app.list.findOne(req.params.list, function(err, list) {
        if (err) {
          res.send(500);
        }
        else {
          if (list) {
            app.item.getListItems(list, req.session.user, req.params.variant, 0, function(err, items) {
              res.render("list", {items: items, list: app.list.prepare(list, req.params.variant), layout: false});
            });
          }
          else {
            res.send(500);
          }
        }
      });
    }
  });

  /**
   * API: Get number of new stories.
   */
  server.get("/api/items/new", app.middleware.restricted, function(req, res) {
    app.item.newCount(req.session.user, function(count) {
      res.json({count: count});
    });
  });

  /**
   * API: Update item pointers - high, low.
   */
  server.get("/api/update", app.middleware.restricted, function(req, res) {
    req.session.user.low = req.session.user.high;
    req.session.user.high = new Date();

    req.session.user.save(function(err) {
      if (err) {
        console.log(err);
        res.send(400);
      }
      else {
        res.send(200);
      }
    });
  });

  /**
   * Subscribe user to a site.
   */
  server.get("/subscribe", app.middleware.restricted, function(req, res) {
    var subscriptions = [];

    app.list.find({user_id: req.session.user._id, type: "channel"}, function(err, lists) {
      for (var i in lists) {
        subscriptions.push(lists[i].channel_id.toString());
      }

      app.channel.find({subscriptions: {$gt: 0}}, function(err, channels) {
        for (var i in channels) {
          channels[i].url_short = channels[i].url.length > 100 ? channels[i].url.substr(0, 100) + '...' : channels[i].url;
          channels[i].status = subscriptions.indexOf(channels[i]._id.toString()) == -1 ? 'status-not-subscribed'  : 'status-subscribed';
        }

        res.render("subscribe", {channels: channels});
      });
    });
  });

  /**
   * Subscribe user to a site.
   */
  server.post("/subscribe", app.middleware.restricted, function(req, res) {
    req.session.user.subscribe(req.body.url, req.body.name, function(err, channel) {
      if (err) {
        res.send(err, 400);
      }
      else {
        res.json(200);
      }
    });
  });

  /**
   * Subscribe user to a site.
   */
  server.post("/subscribe/channel", app.middleware.restricted, function(req, res) {
    req.session.user.subscribeToChannel(req.body.channel_id, function(err, channel) {
      if (err) {
        res.send(err, 400);
      }
      else {
        res.send(200);
      }
    });
  });

  /**
   * Update list data.
   */
  server.post("/list", app.middleware.restricted, function(req, res) {
    app.list.findById(req.body.list_id, function(err, list) {
      if (err) {
        res.send(err, 400);
      }
      else {
        list.name = req.body.name;
        list.save(function(err) {
          err ? res.send(err, 400) : res.send(200);
        });
      }
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
    var validator = app.getValidator();
    var old_rules = [];

    for (var i in req.body.rules) {
      validator.check(req.body.rules[i].item, 'Item selector is always required.').notEmpty();
      validator.check(req.body.rules[i].target.selector, 'Target selector is always required.').notEmpty();
      validator.check(req.body.rules[i].title.selector, 'Title selector is always required.').notEmpty();
    }

    if (validator.hasErrors()) {
      res.send(validator.getErrors()[0], 400);
    }

    async.waterfall([
      // Load channel.
      function(next) {
        app.channel.findById(req.body.channel_id, function(err, channel) {
          next(err, channel);
        });
      },
      // Extract existing rules for logging.
      function(channel, next) {
        app.rule.find({domain: channel.domain}, function(err, rules) {
          for (var i in rules) {
            // Objects contain functions an other shit.
            old_rules.push(JSON.parse(JSON.stringify(rules[i])));
          }

          next(null, channel);
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
          app.rule.create(req.body.rules[i], function(err) {
            if (err) throw err;
          });
        }
        next(null, channel);
      },
      // Update channel items.
      function(channel, next) {
        channel.updateItems(function(err) {
          next(err, channel);
        });
      },
      function(channel, next) {
        app.notify.onRulesChange(req.session.user, channel, old_rules, req.body.rules);
        next();
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
        channel.updateItems(function(err) {
          next();
        });
      },
    ], function(err) {
      err ? res.json(err, 400) : res.send(200);
    });
  });

  /**
  * Create a rule from a profiler configuration.
  */
  server.post("/rule/delete", app.middleware.restricted, function(req, res) {
    async.waterfall([
      // Load channel.
      function(next) {
        app.channel.findById(req.body.channel_id, function(err, channel) {
          next(err, channel);
        });
      },
      // Delete rule.
      function(channel, next) {
        app.rule.findByIdAndRemove(req.body.rule_id, function(err) {
          next(err, channel);
        });
      },
      // Update channel items.
      function(channel, next) {
        channel.updateItems(function(err) {
          next();
        });
      },
    ], function(err) {
      err ? res.json(err, 400) : res.send(200);
    });
  });

  /**
   * Display the list profiling page.
   */
  server.get("/configure/:list", app.middleware.restricted, function(req, res) {
    var params = {};

    async.series([
      // Load list.
      function(next) {
        app.list.findById(req.params.list, function(err, list) {
          if (err) {
            next(err);
          }
          else if (list.type != "channel") {
            next("You cannot configure this list.");
          }
          else {
            params.list = list;
            next();
          }
        })
      },
      // Load channel.
      function(next) {
        app.channel.findById(params.list.channel_id, function(err, channel) {
          if (err) {
            next(err);
          }
          else {
            params.channel = channel;
            next();
          }
        })
      },
      // Load rules.
      function(next) {
        app.rule.find({domain: params.channel.domain}, function(err, rules) {
          params.rules = rules;
          next();
        });
      },
    // Send response.
    ], function(err) {
      if (err) {
        res.send(err, 500);
      }
      else {
        params.channel.url_short = params.channel.url.length > 100 ? params.channel.url.substr(0, 100) + '...' : params.channel.url;
        res.render("configure", {
          list: params.list,
          channel: params.channel,
          rules: params.rules,
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
        app.notify.onSignin(user);
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
    res.render('account', {user:  _.clone(req.session.user)});
  });

  /**
   * Update account settings.
   */
  server.post("/account", app.middleware.restricted, function(req, res) {
    var validator = app.getValidator();

    if (req.session.user.pass !== null) validator.check(app.user.hashPassword(req.session.user._id, req.body.existing_pass), 'Existing password is not correct.').equals(req.session.user.pass);
    validator.check(req.body.pass, 'Password must contain at least 6 characters.').len(6);
    validator.check(req.body.pass, 'Passwords do not match.').equals(req.body.pass2);

    if (validator.hasErrors()) {
      res.send(validator.getErrors()[0], 400);
    }
    else {
      req.session.user.pass = app.user.hashPassword(req.session.user._id, req.body.pass);
      req.session.user.save(function(err) {
        if (err) throw err;
        app.notify.onAccountChange(req.session.user);
        res.send(200);
      });
    }
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
   * Handle password reminder form submission.
   */
  server.post('/password', function(req, res) {
    app.user.findOne({mail: req.body.mail}, function(err, user) {
      if (err) throw err;

      if (user) {
        var new_pass = hash('adler32', 'efiwn.ue@WEOJ32' + new Date().getTime());
        user.pass = app.user.hashPassword(user._id, new_pass);
        user.save(function(err) {
          app.mail({to: user.mail, subject: 'A new password has been created'}, 'password', {password: new_pass});
          app.notify.onPasswordReminder(user);
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
   * Initialize demo session.
   */
  server.get("/fetch/channel/:channel", function(req, res) {
    app.channel.findById(req.params.channel, function(err, channel) {
      if (err) throw err;

      app.fetch({url: channel.url}, function(err, page) {
        if (err) throw err;

        if (page) {
          res.header("Content-Type", "text/plain");
          res.end(page.toString());
        }
        else {
          res.send("Empty content.");
        }
      });
    });
  });
}

exports.init = function(done) {
  this.httpsServer.listen(8443);
  this.httpServer.listen(8080);
  done();
}