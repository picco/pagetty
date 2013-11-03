exports.attach = function (options) {
  var app = this;

  // Load required libraries.
  var _ = require('underscore');
  var $ = require('cheerio');
  var async = require('async');
  var check = require('validator').check;
  var express = require('express');
  var fs = require('fs');
  var gzippo = require('gzippo');
  var hash = require("mhash").hash;
  var hbs = require("hbs");
  var helmet = require("helmet");
  var mongoStore = require('connect-mongo')(express);
  var mongoose = require('mongoose');

  app.everyauth = require('everyauth');
  app.http = require('http');
  app.https = require('https');

  // Load sdferver plugins.
  app.use(require('./middleware.js'));

  // Create an Express server.
  app.server = express();

  app.ssl_options = {
    ca: fs.readFileSync('./config/ssl/' + app.conf.domain + '/ca.crt'),
    key: fs.readFileSync('./config/ssl/' + app.conf.domain + '/server.key.nopass'),
    cert: fs.readFileSync('./config/ssl/' + app.conf.domain + '/server.crt')
  };

  // Define partials used by Handlebars.
  hbs.registerPartial('list', fs.readFileSync(app.dir + '/views/list.hbs', 'utf8'));
  hbs.registerPartial('list_items', fs.readFileSync(app.dir + '/views/list_items.hbs', 'utf8'));  
  hbs.registerPartial('items', fs.readFileSync(app.dir + '/views/items.hbs', 'utf8'));
  hbs.registerPartial('html_rule', fs.readFileSync(app.dir + '/views/html_rule.hbs', 'utf8'));
  hbs.registerPartial('rss_rule', fs.readFileSync(app.dir + '/views/rss_rule.hbs', 'utf8'));

  hbs.registerHelper("eq", function(v1, v2, options) {
    var a = new String(v1);
    var b = new String(v2);
    return (a.toString() == b.toString()) ? options.fn(this) : options.inverse(this);
  });

  hbs.registerHelper("neq", function(v1, v2, options) {
    return (v1 != v2) ? options.fn(this) : options.inverse(this);
  });

  hbs.registerHelper("property", function(obj, key, options) {
    return obj[key];
  });

  hbs.registerHelper("select", function(value, options) {
    var $el = $('<select />').html(options.fn(this));
    $el.find('[value=' + value + ']').attr({'selected':'selected'});
    return $el.html();
  });

  hbs.registerHelper("icon", function(options) {
    if (this.type == "channel") {
      return "url(https://s2.googleusercontent.com/s2/favicons?domain=" + this.domain + ")";
    }
    else {
      return "none";
    }
  });

  hbs.registerHelper("fresh_count", function(fc, options) {
    if (fc && fc[this._id]) {
      return "+" + fc[this._id];
    }
    else {
      return "";
    }
  });

  // Set up server middleware and configuration.
  app.server.set('view engine', 'hbs');
  app.server.set('view cache', true);
  app.server.use(app.middleware.logger);
  //app.server.use(app.middleware.forceHTTPS);
  app.server.use(app.middleware.imagecache);
  app.server.use(gzippo.staticGzip('./public', {contentTypeMatch: /text|javascript|json/}));
  app.server.use(express.bodyParser());
  app.server.use(helmet.xframe());
  app.server.use(express.cookieParser());
  app.server.use(express.session({secret: 'nõude', store: new mongoStore({host: app.conf.db_host, port: app.conf.db_port, db: app.conf.db_name})}));
  app.server.use(app.middleware.session);
  app.server.use(gzippo.compress());
  app.server.use(app.middleware.locals);
  app.server.use(app.server.router);
  app.server.use(express.errorHandler({showMessage: true, dumpExceptions: false, showStack: false}));

  /**
   * Render the main application.
   */
  this.renderApp = function(req, res) {
    var self = this;
    var list = null;
    var user_lists = {all: app.list.all()};
    var fresh_counts = {};
    var render = {};

    if (req.session.user) {
      var variant = req.params.variant ? req.params.variant : 'time';

      async.series([
        function(next) {
          if (!req.params.list_id || req.params.list_id == "all") {
            list = app.list.all()
            user_lists.all.active = true;
            next();
          }
          else if (req.params.list_id == "search") {
            list = app.list.search(variant);
            next();
          }
          else {
            app.list.findOne({user_id: req.session.user._id, _id: req.params.list_id}, function(err, doc) {
              if (doc) {
                list = doc;
                next();
              }
              else {
               next("List not found.");
              }
            });
          }
        },
        function(next) {
          req.session.user.getFreshCounts(function(err, counts) {
            fresh_counts = counts;
            next();
          });
        },
        function(next) {
          app.list.find({user_id: req.session.user._id, directory_id: {$exists: false}}).sort({name: "asc"}).execFind(function(err, lists) {
            if (err) console.log(err);

            async.forEach(lists, function(item, iterate) {
              if (item.type == "directory") {
                app.list.find({user_id: req.session.user._id, directory_id: item._id}, function(err, docs) {
                  item.sublists = app.list.sortNavigation(docs, fresh_counts);
                  user_lists[item._id] = item;
                  iterate();
                });
              }
              else {
                user_lists[item._id] = item;
                iterate();
              }
            }, function() {
              next();
            });
          });

        },
        function(next) {
          req.session.user.getDirectories(function(err, dirs) {
            render.directories = dirs;
            next();
          });
        },
        function(next) {
          app.item.getNewCount(req.session.user, function(count) {
            render.new_count = count;
            next();
          });
        },
        function(next) {
          if (list.type == "channel") {
            app.channel.findById(list.channel_id, function(err, channel) {
              list.channel_url = channel ? channel.url : null;
              next();
            });
          }
          else {
            next();
          }
        }
      ], function(err, callback) {
        render.app = "app";
        render.list = list;
        render.lists = app.list.sortNavigation(_.toArray(user_lists), fresh_counts);
        render.lists_json = JSON.stringify(user_lists);
        render.user = req.session.user;
        render.variant = variant;
        render.fresh_counts = fresh_counts;
        res.render("app", render);
      });
    }
    else {
      res.render("index");
    }
  }

  /**
   * Redirect to the frontpage.
   */
  app.server.get("/front", function(req, res) {
    res.redirect("/");
  });

  /**
   * API: send the whole source code of the channel.
   */
  app.server.get("/api/channel/sample/:id/:selector", app.middleware.restricted, function(req, res) {
    app.channel.findById(req.params.id, function(err, channel) {
      app.fetch({url: channel.url}, function(err, buffer) {
        var html = $('<div>').append($(app.bufferToString(buffer)).find(req.params.selector).first().clone()).remove().html();
        app.tidy(html, function(err, formatted) {
          res.send(_.escape(err ? html : formatted));
        });
      });
    });
  });
 
  /**
   * API: Load items from client-side.
   */
  app.server.get("/api/items/:list/:variant/:page", app.middleware.restricted, function(req, res) {
    app.list.getById(req.params.list, req.params.variant, function(err, list) {
      if (err) {
        res.send(500);
      }
      else {
        app.item.getListItems(list, req.session.user, req.params.variant, req.params.page, function(err, items) {
          items.length ? res.json("items", {items: items}) : res.send(404);
        });
      }
    });
  });

  /**
   * API: Get number of new stories.
   */
  app.server.get("/api/items/new", app.middleware.restricted, function(req, res) {
    app.item.getNewCount(req.session.user, function(count) {
      res.json({count: count});
    });
  });

  /**
   * API: Update item pointers - high, low.
   */
  app.server.get("/api/update", app.middleware.restricted, function(req, res) {
    req.session.user.updateReadState(function(err) {
      if (err) {
        res.send(400);
      }
      else {
        req.session.user.getFreshCounts(function(err, counts) {
          err ? res.send(400) : res.send(counts, 200);
        });
      }
    });
  });

  /**
   * Display subscription page.
   */
  app.server.get("/add", app.middleware.restricted, function(req, res) {
    res.render("add", {url: req.query.url});
  });

  /**
   * Detect feeds to which user can subscribe.
   */
  app.server.post("/subscribe/options", app.middleware.restricted, app.middleware.csrf, function(req, res) {
    app.parseFeed(req.body.url, function(err, feed) {
      if (err) {
        res.send(err, 400);
      }
      else {
        if (feed.type == "rss") {
          req.session.user.subscribe({url: feed.url}, function(err, list) {
            err ? res.send(err, 400) : res.json({status: "subscribed", list_id: list._id}, 200);
          });
        }
        else {
          res.json({status: "options", options: feed.feeds, type: feed.type, url: feed.url}, 200);
        }
      }
    });
  });

  /**
   * Subscribe to a feed.
   */
  app.server.post("/subscribe", app.middleware.restricted, app.middleware.csrf, function(req, res) {
    req.session.user.subscribe({url: req.body.url}, function(err, list) {
      err ? res.send(err, 500) : res.json({list_id: list._id});
    });
  });

  /**
   * Display import page.
   */
  app.server.get("/import", app.middleware.restricted, function(req, res) {
    res.render("import");
  });

  /**
   * Handle OPML import.
   */
  app.server.post("/import", app.middleware.restricted, function(req, res) {
    var opml = require("opmlparser");
    var parser = new opml();

    parser.parseFile(req.files.opml.path, function(err, meta, feeds, outline) {
      if (feeds && feeds.length) {
        async.each(feeds, function(feed, iterate) {
          req.session.user.subscribe({url: feed.xmlurl, directory: feed.folder, crawl: false}, function(err) {
            iterate();
          });
        }, function(err) {
          err ? res.redirect("/import") : res.redirect("/");
        });
      }
      else {
        res.redirect("/import");
      }
    });
  });

  app.server.get("/crawl/:list/:channel", app.middleware.restricted, function(req, res) {
    app.channel.findById(req.params.channel, function(err, channel) {
      if (err) {
        app.err("/crawl/:list/:channel", err);
        res.redirect("/list/" + req.params.list);
      }
      else {
        channel.crawl(function(err) {
          if (err) app.err("/crawl/:list/:channel", err);

          req.session.user.updateReadState(function() {
            res.redirect("/list/" + req.params.list);
          });
        });
      }
    });
  });

  /**
   * Update list data.
   */
  app.server.post("/list", app.middleware.restricted, app.middleware.csrf, function(req, res) {
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
   * Move a channel list to a directory list.
   */
  app.server.get("/list/move/:list/:directory/:name?", app.middleware.restricted, function(req, res) {
    var list;
    var directory;

    async.waterfall([
      function(next) {
        app.list.findOne({_id: req.params.list, user_id: req.session.user._id, type: "channel"}, function(err, doc) {
          if (err || !doc) {
            next("Invalid source list.")
          }
          else {
            list = doc;
            next();
          }
        });
      },
      function(next) {
        if (req.params.directory == "new") {
          if (req.params.name) {
            app.list.create({type: "directory", user_id: req.session.user._id, name: req.params.name}, function(err, doc) {
              if (err) {
                next("Error saving folder.");
              }
              else {
                directory = doc;
                next();
              }
            });
          }
          else {
            next("Invalid folder name.");
          }
        }
        else if (req.params.directory == "root") {
          next();
        }
        else {
          app.list.findOne({_id: req.params.directory, user_id: req.session.user._id, type: "directory"}, function(err, doc) {
            if (err || !doc) {
              next("Invalid target directory.")
            }
            else {
              directory = doc;
              next();
            }
          });
        }
      },
      function(next) {
        if (req.params.directory == "root") {
          list.directory_id = undefined;
        }
        else {
          list.directory_id = directory._id;
        }

        list.save(next);
      },
    ], function(err) {
      err ? res.send(500, err) : res.redirect("/list/" + list._id);
    });
  });

  /**
   * Rename a list.
   */
  app.server.get("/list/rename/:list/:name", app.middleware.restricted, function(req, res) {
    app.list.findOne({_id: req.params.list, user_id: req.session.user._id}, function(err, list) {
      if (err || !list) {
        res.send(400, "Invalid list.");
      }
      else {
        list.name = req.params.name;
        list.save(function(err) {
          err ? res.send(500, err) : res.redirect("/list/" + list._id);
        });
      }
    });
  });

  /**
   * Remove a directory.
   */
  app.server.get("/list/remove/:list", app.middleware.restricted, function(req, res) {
    app.list.findOne({_id: req.params.list, type: "directory"}, function(err, list) {
      if (err) {
        res.send(500, "Error removing folder.");
      }
      else if (list) {
        list.remove(function(err) {
          err ? res.send(500, "Error removing folder.") : res.redirect("/");
        });
      }
      else {
        res.send(500, "Error removing folder.");
      }
    });
  });

  /**
   * Unsubscrbe user from a site.
   */
  app.server.get("/unsubscribe/:channel", app.middleware.restricted, function(req, res) {
    req.session.user.unsubscribe(req.params.channel, function(err) {
      err ? res.send(400, err) : res.redirect("/");
    });
  });

  /**
   * Unsubscrbe user from a site.
   */
  app.server.post("/unsubscribe", app.middleware.restricted, app.middleware.csrf, function(req, res) {
    req.session.user.unsubscribe(req.body.channel_id, function(err) {
      err ? res.send(400, err) : res.send(200);
    });
  });

  /**
   * Save a rule.
   */
  app.server.post("/rule", app.middleware.restricted, app.middleware.csrf, function(req, res) {
    var validator = app.getValidator();
    var valid_modes = ["page", "rss"];

    async.waterfall([
      // Load channel.
      function(next) {
        app.channel.findById(req.body.channel_id, function(err, channel) {
          channel ? next(err, channel) : next("Channel not found.");
        });
      },
      // Validaate rule data.
      function(channel, next) {
        if (channel.type == "rss") {
          //validator.check(req.body.rule.image.mode, 'Invalid image mode.').notEmpty().isIn(valid_modes);
          //validator.check(req.body.rule.score.mode, 'Invalid score mode.').notEmpty().isIn(valid_modes);
          //validator.check(req.body.rule.comments.mode, 'Invalid comments mode.').notEmpty().isIn(valid_modes);
        }
        else {
          validator.check(req.body.rule.item, 'Item selector is always required.').notEmpty();
          validator.check(req.body.rule.target.selector, 'Target selector is always required.').notEmpty();
          validator.check(req.body.rule.title.selector, 'Title selector is always required.').notEmpty();
        }

        validator.hasErrors() ? next(validator.getErrors()[0]) : next(null, channel);
      },
      // Save the rule.
      function(channel, next) {
        var rule = {type: channel.type, domain: channel.domain};

        if (channel.type == "rss") {
          rule.image = {
            selector: req.body.rule.image.selector,
            attribute: req.body.rule.image.attribute,
          };
          rule.score = {
            selector: req.body.rule.score.selector,
            attribute: req.body.rule.score.attribute,
          };
          rule.comments = {
            selector: req.body.rule.comments.selector,
            attribute: req.body.rule.comments.attribute,
          };
        }
        else {
          rule.item = req.body.rule.item;
          rule.target = {
            selector: req.body.rule.target.selector,
            attribute: req.body.rule.target.attribute,
          };
          rule.title = {
            selector: req.body.rule.title.selector,
            attribute: req.body.rule.title.attribute,
          };
          rule.image = {
            selector: req.body.rule.image.selector,
            attribute: req.body.rule.image.attribute,
          };
          rule.score = {
            selector: req.body.rule.score.selector,
            attribute: req.body.rule.score.attribute,
          };
          rule.comments = {
            selector: req.body.rule.comments.selector,
            attribute: req.body.rule.comments.attribute,
          };
        }

        app.rule.findOneAndUpdate({type: rule.type, domain: rule.domain}, rule, {upsert: true}, function(err) {
          next(err, channel);
        });
      },
      // Update channel items.
      function(channel, next) {
        channel.crawl(function(err) {
          next(err, channel);
        });
      },
      function(channel, next) {
        app.notify.onRulesChange(req.session.user, channel, req.body.rule);
        next();
      }
    ], function(err) {
      err ? res.json(400, err) : res.send(200);
    });
  });

  /**
   * Display the list profiling page.
   */
  app.server.get("/configure/:list", app.middleware.restricted, function(req, res) {
    var params = {};

    async.series([
      // Load list.
      function(next) {
        app.list.findById(req.params.list, function(err, list) {
          if (err) {
            next(err);
          }
          else if (!list) {
            next("List not found.");
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
      // Load rule.
      function(next) {
        app.rule.findOne({type: params.channel.type, domain: params.channel.domain}, function(err, rule) {
          params.rule = rule;
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
          rule: params.rule,
        });
      }
    });

  });

  /**
   * Log the user in to the system.
   */
  app.server.post("/signin", app.middleware.csrf, function(req, res) {
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
   * Log the user out of the system and destroy the session.
   */
  app.server.get("/signout", function(req, res) {
    req.session.destroy(function(err) {
      res.redirect('/');
    });
  });

  /**
   * Display sign-up form.
   */
  app.server.get("/signup", function(req, res) {
    res.render('signup');
  });

  /**
   * Process sign-up request.
   */
  app.server.post("/signup", function(req, res) {
    app.user.signup(req.body, function(err) {
      err ? res.send(err, 400) : res.send(200);
    });
  });

  /**
   * Display sign-up confirmation page.
   */
  app.server.get("/signup/verification", function(req, res) {
    res.render('signup_verification');
  });

  /**
   * Activate the user account and log in automatically.
   */
  app.server.get('/activate/:verification', function(req, res) {
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
  app.server.get("/account", app.middleware.restricted, function(req, res) {
    res.render('account', {user:  _.clone(req.session.user)});
  });

  /**
   * Update account settings.
   */
  app.server.post("/account", app.middleware.restricted, app.middleware.csrf, function(req, res) {
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
   * Delete the user account.
   */
  app.server.post('/account/delete', app.middleware.restricted, app.middleware.csrf, function(req, res) {
    req.session.user.remove(function(err) {
      req.session.destroy(function(err) {
        res.redirect('/');
      });
    });
  });

  /**
   * Save user preferences.
   */
  app.server.post("/preferences", app.middleware.restricted, app.middleware.csrf, function(req, res) {
    req.session.user.save(function(err) {
      err ? res.send("Error saving preferences.", 400) : res.send(200);
    });
  });

  /**
   * Display sign-up form.
   */
  app.server.get('/password', function(req, res) {
    res.render('password');
  });

  /**
   * Handle password reminder form submission.
   */
  app.server.post('/password', app.middleware.csrf, function(req, res) {
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
   * APP URL's.
   */
  app.server.get("/", this.renderApp);
  app.server.get("/list/:list_id", app.middleware.restricted, this.renderApp);
  app.server.get("/list/:list_id/:variant", app.middleware.restricted, this.renderApp);

}

exports.init = function(done) {
  var app = this;
  app.log("Starting server on ports:", app.conf.http_port, app.conf.https_port);
  app.http.createServer(app.server).listen(app.conf.http_port);
  //app.https.createServer(app.ssl_options, app.server).listen(app.conf.https_port);
  done();
}