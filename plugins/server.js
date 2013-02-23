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
  var hbs = require("hbs");
  var mongoStore = require('connect-mongo')(express);
  var mongoose = require('mongoose');

  app.everyauth = require('everyauth');
  app.http = require('http');
  app.https = require('https');

  // Load server plugins.
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
  hbs.registerPartial('items', fs.readFileSync(app.dir + '/views/items.hbs', 'utf8'));
  hbs.registerPartial('html_rule', fs.readFileSync(app.dir + '/views/html_rule.hbs', 'utf8'));
  hbs.registerPartial('rss_rule', fs.readFileSync(app.dir + '/views/rss_rule.hbs', 'utf8'));

  hbs.registerHelper("eq", function(v1, v2, options) {
    return (v1 == v2) ? options.fn(this) : options.inverse(this);
  });

  hbs.registerHelper("neq", function(v1, v2, options) {
    return (v1 != v2) ? options.fn(this) : options.inverse(this);
  });

  hbs.registerHelper("select", function(value, options) {
    var $el = $('<select />').html(options.fn(this));
    $el.find('[value=' + value + ']').attr({'selected':'selected'});
    return $el.html();
  });

  // Set up server middleware and configuration.
  app.server.use(app.middleware.forceHTTPS);
  app.server.use(app.middleware.imagecache);
  app.server.use(gzippo.staticGzip('./public', {contentTypeMatch: /text|javascript|json/}));
  app.server.use(express.bodyParser());
  app.server.use(express.cookieParser());
  app.server.use(express.session({secret: 'nõude', store: new mongoStore({db: app.conf.db_name})}));
  app.server.use(app.middleware.session);
  app.server.set('view engine', 'hbs');
  app.server.set('views', './views');
  // View cache is enabled by default for production in express, but this messes things up.
  app.server.set('view cache', false);
  app.server.use(express.errorHandler({dumpExceptions: false, showStack: false}));
  app.server.use(gzippo.compress());
  //app.server.use(app.server.router);
  app.server.use(app.everyauth.middleware());
  app.server.use(app.middleware.locals);

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

            async.forEach(lists, function(item, iterate) {
              item.icon = 'https://s2.googleusercontent.com/s2/favicons?domain=' + item.domain;
              item.active = (req.params.list_id == item._id) ? ' active' : '';
              user_lists[item._id] = item;
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
   * APP URL's.
   */
  app.server.get("/", this.renderApp);
  app.server.get("/list/:list_id", app.middleware.restricted, this.renderApp);
  app.server.get("/list/:list_id/:variant", app.middleware.restricted, this.renderApp);

  /**
   * API: send the whole source code of the channel.
   */
  app.server.get("/api/channel/sample/:id/:selector", app.middleware.restricted, function(req, res) {
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
  app.server.get("/api/app/style/:narrow", app.middleware.restricted, function(req, res) {
    req.session.user.narrow = req.params.narrow == 1 ? true : false;
    req.session.user.save(function(err) {
      res.send(200);
    });
  });

  /**
   * API: Load items from client-side.
   */
  app.server.get("/api/items/:list/:variant/:page", app.middleware.restricted, function(req, res) {

    function render(list) {
      app.item.getListItems(list, req.session.user, req.params.variant, req.params.page, function(err, items) {
        items.length ? res.render("items", {items: items, list: app.list.prepare(list, req.params.variant), layout: false}) : res.send(404);
      });
    }

    if (req.params.list == "all") {
      render(app.list.all());
    }
    else {
      app.list.findById(req.params.list, function(err, list) {
        (err || !list) ? res.send(500) : render(list);
      });
    }
  });

  /**
   * API: Load items from client-side.
   */
  app.server.get("/api/list/:list/:variant", app.middleware.restricted, function(req, res) {
    if (req.params.list == "all") {
      list = app.list.all();

      app.item.getListItems(list, req.session.user, req.params.variant, 0, function(err, items) {
        res.render("list", {items: items, list: app.list.prepare(list, req.params.variant), layout: false});
      });
    }
    else {
      app.list.findById(req.params.list, function(err, list) {
        if (err) {
          res.send(500);
        }
        else {
          if (list) {
            console.dir(list);
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
  app.server.get("/api/items/new", app.middleware.restricted, function(req, res) {
    app.item.newCount(req.session.user, function(count) {
      res.json({count: count});
    });
  });

  /**
   * API: Update item pointers - high, low.
   */
  app.server.get("/api/update", app.middleware.restricted, function(req, res) {
    req.session.user.updateReadState(function(err) {
      err ? res.send(400) : res.send(200);
    });
  });

  /**
   * Display subscription page.
   */
  app.server.get("/add", app.middleware.restricted, function(req, res) {
    res.render("subscribe");
  });

  /**
   * Subscribe user to a site.
   */
  app.server.post("/subscribe/options", app.middleware.restricted, function(req, res) {
    app.parseFeed(req.body.url, function(err, feed) {
      if (err) {
        res.send(err, 400);
      }
      else {
        if (feed.type == "rss") {
          req.session.user.subscribe(feed.url, function(err, list) {
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
   * Subscribe user to a feed.
   */
  app.server.get("/subscribe", app.middleware.restricted, function(req, res) {
    req.session.user.subscribe(req.query.url, function(err, list) {
      res.redirect("/list/" + list._id);
    });
  });

  /**
   * Update list data.
   */
  app.server.post("/list", app.middleware.restricted, function(req, res) {
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
  app.server.post("/unsubscribe", app.middleware.restricted, function(req, res) {
    req.session.user.unsubscribe(req.body.channel_id, function(err) {
      err ? res.send(400, err) : res.send(200);
    });
  });

  /**
   * Save a rule.
   */
  app.server.post("/rule", app.middleware.restricted, function(req, res) {
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
      /*
      // Notify about the change.
      function(channel, next) {
        app.notify.onRulesChange(req.session.user, channel, old_rules, req.body.rules);
        next();
      }
      */
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
  app.server.post("/signin", function(req, res) {
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
  app.server.get("/signout", function(req, res) {
    delete req.session.user;
    res.redirect('/');
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
  app.server.post("/account", app.middleware.restricted, function(req, res) {
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
  app.server.get('/account/delete', app.middleware.restricted, function(req, res) {
    req.session.user.remove(function(err) {
      delete req.session.user;
      res.redirect('/');
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
  app.server.post('/password', function(req, res) {
    app.user.findOne({mail: req.body.mail}, function(err, user) {
      if (err) throw err;

      if (user) {
        var new_pass = app.hash('adler32', 'efiwn.ue@WEOJ32' + new Date().getTime());
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
}

exports.init = function(done) {
  var app = this;
  app.http.createServer(app.server).listen(8080);
  app.https.createServer(app.ssl_options, app.server).listen(8443);
  done();
}