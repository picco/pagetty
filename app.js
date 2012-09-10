var
_          = require('underscore'),
$          = require('cheerio'),
async      = require("async"),
fs         = require('fs'),
util       = require('util'),
config     = require('config').server,
express    = require('express'),
gzippo     = require('gzippo');
hulk       = require('hulk-hogan'),
hogan      = require('hogan.js'),
futures    = require('futures'),
logger     = require(__dirname + "/lib/logger.js");
mustache   = require('mustache'),
MongoStore = require('connect-mongo')(express),
pagetty    = require('./lib/pagetty.js');


/**
 * Create a HTTP server.
 */
var app = express.createServer({
  ca: fs.readFileSync(__dirname + "/ssl/" + config.domain + "/ca.crt"),
  key: fs.readFileSync(__dirname + "/ssl/" + config.domain + "/server.key.nopass"),
  cert: fs.readFileSync(__dirname + "/ssl/" + config.domain + "/server.crt")
});

/**
 * Create a secure HTTPS server.
 */
var unsecure = express.createServer();

/**
 * Define authentication middleware.
 */
var restricted = function(req, res, next) {
  if (req.session.user) {
    next();
  }
  else {
    res.statusCode = 403;
    res.end("Access denied");
  }
}

app.configure(function() {
  app.register(".hulk", hulk);
  // The image serving middleware, keep in front of the stack since it does not need other middleware.
  app.use(pagetty.imageCache);
  app.use(gzippo.staticGzip(__dirname + "/public", {contentTypeMatch: /text|javascript|json/}));
  app.use(express.bodyParser());
  app.use(express.cookieParser());
  app.use(express.session({secret: "nõude", store: new MongoStore({db: config.db_name})}));
  app.use(pagetty.session);
  app.set('view engine', 'hulk');
  app.set('views', __dirname + '/views');
  app.use(express.errorHandler({dumpExceptions: true, showStack: true}));
  app.use(gzippo.compress());
  app.use(app.router);
});

/**
 * Catch uncaught exceptions.
 */
/*
process.on("uncaughtException", function(e) {
  logger.log.error("Uncaught exception: " + e);
});
*/

/**
 * Initialize and start the servers.
 */
pagetty.init(function (self) {
  /**
   * Render the app.
   */

  function renderApp(req, res) {
    if (req.headers.host == "demo.pagetty.com") {
      res.render("app_demo", {bodyClass: "app"});
    }
    else {
      if (req.session.user) {
        res.render("app", {bodyClass: "app"});
      }
      else {
        res.render("index");
      }
    }
  }

  app.get("/", renderApp);
  app.get(/^\/channel\/.+/, renderApp);

  /**
   * API: send user information.
   */
  app.get("/api/user", restricted, function(req, res) {
    res.json(req.session.user);
  });

  /**
   * API: demo user.
   */
  app.get("/api/demo/user", function(req, res) {
    res.json(pagetty.loadDemoAccount());
  });

  app.get("/test", function(req, res) {
    res.end("asd");
  });

  /**
   * API: demo channels.
   */
  app.get("/api/demo/channels", function(req, res) {
    pagetty.loadDemoChannels(function(channels) {
      var channelsObject = {};

      for (var index in channels) {
        for (var i in channels[index].items) {
          channels[index].items[i].created = channels[index].items[i].created.getTime();
        }
        channels[index].items_added = channels[index].items_added ? channels[index].items_added.getTime() : null;
        channels[index].items_updated = channels[index].items_updated ? channels[index].items_updated.getTime() : null;
        channelsObject[channels[index]._id] = channels[index];
      }
      res.json(channelsObject);
    });
  });

  /**
   * API: send user subscription information.
   */
  app.get("/api/user/channels", restricted, function(req, res) {
    pagetty.loadSubscribedChannels(req.session.user, function(channels) {
      var channelsObject = {};

      for (var index in channels) {
        for (var i in channels[index].items) {
          channels[index].items[i].created = channels[index].items[i].created.getTime();
        }
        channels[index].items_added = channels[index].items_added ? channels[index].items_added.getTime() : null;
        channels[index].items_updated = channels[index].items_updated ? channels[index].items_updated.getTime() : null;
        channelsObject[channels[index]._id] = channels[index];
      }
      res.json(channelsObject);
    });
  });

  /**
   * API: send the whole source code of the channel.
   */
  app.get("/api/configure/source/:id", restricted, function(req, res) {
    pagetty.loadChannel(req.params.id, function(err, channel) {
      pagetty.request({url: channel.url}, function(err, response, body) {
        res.send(_.escape(body));
      });
    });
  });

  /**
   * API: Autogenerate rule data
   */
  app.get("/api/configure/generate/:id/:title", restricted, function(req, res) {
    pagetty.loadChannel(req.params.id, function(err, channel) {
      pagetty.request({url: channel.url}, function(err, response, body) {
        pagetty.generateItemSelector(body, req.params.title, function(err, selector) {
          if (err) {
            res.send(400);
          }
          else {
            res.send(selector);
          }
        })
      });
    });
  });

  /**
   * API: send the whole source code of the channel.
   */
  app.get("/api/configure/sample/:id/:selector", restricted, function(req, res) {
    pagetty.loadChannel(req.params.id, function(err, channel) {
      pagetty.request({url: channel.url}, function(err, response, body) {
        console.dir(req.params.selector);
        var html = $('<div>').append($(body).find(req.params.selector).first().clone()).remove().html();
        pagetty.tidy(html, function(formatted) {
          res.send(_.escape(formatted));
        });
      });
    });
  });

  /**
   * Client auto-update call.
   */
  app.get("/api/channel/updates", restricted, function(req, res) {
    pagetty.loadUserChannelUpdates(req.session.user, JSON.parse(req.param("state")), function(updates) {
      res.json(updates);
    });
  });

  /**
   * Subscribe user to a site.
   */
  app.get("/subscribe", restricted, function(req, res) {
    res.render("subscribe");
  });

  /**
   * Subscribe user to a site.
   */
  app.post("/subscribe", restricted, function(req, res) {
    pagetty.subscribe({user_id: req.session.user._id, url: req.body.url}, function(err, channel) {
      if (err) {
        res.send(err, 400);
      }
      else {
        res.json({channel_id: channel._id}, 200);
      }
    });
  });

  /**
   * Unsubscrbe user from a site.
   */
  app.post("/unsubscribe", restricted, function(req, res) {
    pagetty.unsubscribe(req.session.user._id, req.body.channel_id, function(err) {
      if (err) {
        res.send(err, 400);
      }
      else {
        res.send(200);
      }
    });
  });

  /**
   * Get new channel form.
   */
  app.get("/configure/:id", restricted, function(req, res) {
    var params = {};

    async.series([
      // Load channel.
      function(callback) {
        pagetty.loadChannel(req.params.id, function(err, channel) {
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
        pagetty.loadRules({domain: params.channel.domain}, function(rules) {
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
        res.render("configure", {
          channel: params.channel,
          rules: params.rules,
          subscription: req.session.user.subscriptions[params.channel._id]
        });
      }
    });
  });

  /**
   * Save channel configuration.
   */
  app.post("/configure", restricted, function(req, res) {
    var params = {}, data = req.body, validator = pagetty.getValidator();

    async.series([
      // Validate submitted data.
      function(next) {
        validator.check(data.name, "Name must start with a character.").is(/\w+.*/);

        for (var i in data.rules) {
          validator.check(data.rules[i].item, 'Item selector is always required.').notEmpty();
          validator.check(data.rules[i].target.selector, 'Target selector is always required.').notEmpty();
          validator.check(data.rules[i].target.url_attribute, 'URL attribute is always required.').notEmpty();
        }

        validator.hasErrors() ? callback(validator.getErrors()) : next();
      },
      // Update subscription.
      function(next) {
        pagetty.updateSubscription(req.session.user._id, data._id, {name: data.name}, function(err) {
          next(err);
        });
      },
      // Update rules.
      function(next) {
        pagetty.saveRules(data._id, data.rules, function(err) {
          next(err);
        });
      },
      // Update channel items.
      function(next) {
        pagetty.updateChannelItems(data._id, function(err, channel) {
          next();
        });
      }
    // Send response.
    ], function(err) {
      if (err) {
        res.json(err, 400);
      }
      else {
        res.send(200);
      }
    });
  });

  /**
   * Log the user in to the system.
   */
  app.post("/signin", function(req, res) {
    pagetty.authenticate(req.body.username, req.body.password, function(err, user) {
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
   * Display sign-up form.
   */
  app.get("/signup", function(req, res) {
    res.render('signup');
  });

  /**
   * Display sign-up form.
   */
  app.post("/signup", function(req, res) {
    pagetty.signup(req.body.username, req.body.mail, function(err) {
      if (err) {
        res.send(err, 400);
      }
      else {
        res.redirect("/signup/confirm");
      }
    });
  });

  /**
   * Display sign-up confirm page.
   */
  app.get("/signup/confirm", function(req, res) {
    res.render('signup_confirm');
  });

  /**
   * Log the user out of the system.
   */
  app.get("/signout", function(req, res) {
    delete req.session.user;
    res.redirect("/");
  });

  /**
   * Verify the user's e-mail address.
   */
  app.get('/signup/verify/:id', function(req, res) {
    pagetty.checkIfUserUnverified(req.params.id, function(err) {
      if (err) {
        res.render("message", {title: "Account verification failed", message: err});
      }
      else {
        res.redirect("/signup/profile/" + req.params.id);
      }
    });
  });

  /**
   * Let the user fill out initial user profile.
   */
  app.get('/signup/profile/:id', function(req, res) {
    pagetty.checkIfUserUnverified(req.params.id, function(err) {
      if (err) {
        res.render("message", {title: "Something went wrong", message: err});
      }
      else {
        res.render("signup_profile");
      }
    });
  });

  /**
   * Let the user fill out initial user profile.
   */
  app.post('/signup/profile', function(req, res) {
    pagetty.activate(req.body, function(err) {
      if (err) {
        res.json(err, 400);
      }
      else {
        res.send(200);
      }
    });
  });

  /**
   * Display the channel profiling page.
   */
  app.get("/profile/:channel", function(req, res) {
    pagetty.createProfile(req.params.channel, function(err, profile) {
      req.session.profile = profile;
      res.render("profile", {segments: profile.segments});
    });
  });

  /**
   * Display the channel profiling page.
   */
  app.get("/rule/create/*", function(req, res) {
    // TODO: TEST for profile in session
    pagetty.createExtendedSegment(req.session.profile, req.query["segment"], function(err, segment) {
      console.dir(segmrnt);
    });

    res.render("rule_create", {profile: req.session.profile});
  });

  /**
   * Redirect any HTTP requests to the HTTPS site.
   */
  unsecure.get("*", function(req, res) {
    console.log("Reditected user from HTTP");
    res.redirect("https://" + config.domain + req.url);
  });

  /**
   * Start the web server.
   */
  logger.log.info("Pagetty server started on: " + config.domain);
  app.listen(8443);
  unsecure.listen(8080);
});
