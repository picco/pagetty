var
_          = require('underscore'),
async      = require("async"),
fs         = require('fs'),
util       = require('util'),
config     = require('config').server,
express    = require('express'),
hulk       = require('hulk-hogan'),
hogan      = require('hogan.js'),
futures    = require('futures'),
logger     = require(__dirname + "/lib/logger.js");
mustache   = require('mustache'),
MongoStore = require('connect-mongo')(express),
pagetty    = require('./lib/pagetty.js');

/**
 * Create express app.
 */
var app = express.createServer({
  ca: fs.readFileSync(__dirname + "/ssl/ca.pem"),
  key: fs.readFileSync(__dirname + "/ssl/pagetty.key.nopass"),
  cert: fs.readFileSync(__dirname + "/ssl/pagetty.crt")
});

app.configure(function() {
  app.register(".hulk", hulk);
  app.use(function(req, res, next) {
    var
      remoteAddr = req.socket && (req.socket.remoteAddress || (req.socket.socket && req.socket.socket.remoteAddress)),
      date = new Date().toUTCString(),
      httpVersion = req.httpVersionMajor + '.' + req.httpVersionMinor,
      referrer = req.headers['referer'] || req.headers['referrer'];
    //':remote-addr - - [:date] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"'
    //logger.accessLog.info(remoteAddr + " - - [" + date + "] " + req.method + " " + req.originalUrl + " HTTP/" + httpVersion + " " + res.statusCode + " " + referrer + " " + req.headers['user-agent']);
    next();
  });
  app.use(pagetty.imageCache);
  app.use(express.static(__dirname + '/public'));
  app.use(express.bodyParser());
  app.use(express.cookieParser());
  app.use(express.session({
    secret: "nõude",
    store: new MongoStore({
      db: config.db_name
    })
  }));
  app.use(function(req, res, next) {
    pagetty.user = req.session.user;
    next();
  });
  app.set('view engine', 'hulk');
  app.set('views', __dirname + '/views');
  app.use(express.errorHandler({dumpExceptions: true, showStack: true}));
  app.use(app.router);
});

/**
 * Create a redirecting HTTP server.
 */
var http = express.createServer();
http.all("*", function(req, res) {
  res.redirect("https://pagetty.com" + req.url, 301);
});

/**
 * Define authentication middleware.
 */
var restricted = function(req, res, next) {
  if (req.session.user) {
    next();
  }
  else {
    res.redirect('/login');
  }
}

/**
 * Render frontpage or the app.
 */
app.get("/", function(req, res) {
  var sequence = futures.sequence(), err, user, channels;

  pagetty.login("ivo", "ivonellis", function(err, user) {
    if (err) {
      res.send(400);
    }
    else {
      req.session.user = user;

      sequence.then(function(next, err) {
        pagetty.loadUser(req.session.user._id, function(u) {
          user = u;
          next();
        });
      })
      .then(function(next, err) {
        pagetty.loadSubscribedChannels(user, function(c) {
          channels = c;
          next();
        });
      })
      .then(function(next, err) {
        res.render("app", {
          title: "pagetty",
          user: JSON.stringify(req.session.user),
          channels: JSON.stringify(channels),
          bodyClasses: "app"
        });
      });
    }
  });
});

/**
 * Client auto-update call.
 */
app.get('/update', restricted, function(req, res) {
  pagetty.loadUserChannelUpdates(req.session.user, req.param("state"), function(updates) {
    res.json(updates);
  });
});

/**
 * GET new channel form.
 */
app.get('/channel/add', restricted, function(req, res) {
  var channel = {components: [{}]};

  pagetty.fetchLinks(req.query.url, function(err, links) {
    res.render('channel_form', {channel: channel, links: links});
  });
});

/**
 * Validate channel data, try to fetch some items from the channel.
 */
app.post('/channel/validate', restricted, function(req, res) {
  var channel = req.body;
  var errors = pagetty.validateChannel(channel);

  if (errors.length) {
    res.json(errors, 400);
  }
  else {
    pagetty.fetchChannelItems(channel, function(err, channel) {
      if (err) {
        res.json({fetch_error: err}, 400);
      }
      else {
        res.json(channel, 200);
      }
    });
  }
});

/**
 * Dummy callback for invisible iframes.
 */
app.post('/null', function(req, res) {
  res.send(200);
});

/**
 * Display a list of available channels.
 */
app.get('/channels', restricted, function(req, res) {
  pagetty.loadAllChannels(function(err, channels) {
    if (err) {
      res.send(500);
    }
    else {
      var ca = _.toArray(channels);

      for (var i in ca) {
        ca[i] = pagetty.attachChannelTemplating(ca[i]);
      }

      res.render('channels', {channels: ca});
    }
  });
});

/**
 * Display a preview of a single channel.
 */
app.get('/preview/:id', function(req, res) {
  pagetty.loadChannel(req.params.id, function(err, channel) {
    if (err) {
      log.error(err);
      res.send(404);
    }
    else {
      res.render('preview', {channel: JSON.stringify(channel)});
    }
  });
});

/**
 * Subscribe use to a site.
 */
app.post("/subscribe", restricted, function(req, res) {
  pagetty.subscribe({user_id: req.session.user._id, url: req.body.url}, function(err) {
    if (err) {
      res.send(err, 400);
    }
    else {
      res.json(200);
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
    function(callback) {
      validator.check(data.name, "Name must start with a character.").is(/\w+.*/);

      for (var i in data.rules) {
        validator.check(data.rules[i].item, 'Item selector is always required.').notEmpty();
        validator.check(data.rules[i].target.selector, 'Target selector is always required.').notEmpty();
        validator.check(data.rules[i].target.url_attribute, 'URL attribute is always required.').notEmpty();
      }

      validator.hasErrors() ? callback(validator.getErrors()) : callback();
    },
    // Update subscription.
    function(callback) {
      pagetty.updateSubscription(req.session.user._id, data._id, {name: data.name}, function(err) {
        callback(err);
      });
    },
    // Update rules.
    function(callback) {
      pagetty.saveRules(data._id, data.rules, function(err) {
        callback(err);
      });
    },
    // Update channel items.
    function(callback) {
      pagetty.updateChannelItems(data._id, function(err, channel) {
        callback();
      });
    }
  // Send response.
  ], function(err) {
    if (err) {
      console.dir(err);
      res.json(err, 400);
    }
    else {
      res.send(200);
    }
  });
});

/**
 * Display sign-up form.
 */
app.get('/signup', function(req, res) {
  res.render('signup');
});

/**
 * Display sign-up form.
 */
app.post("/signup", function(req, res) {
  pagetty.signup(req.body.mail, function(err) {
    if (err) {
      res.send(err, 400);
    }
    else {
      res.send(200);
    }
  });
});

/**
 * Display the login form.
 */
app.get("/login", function(req, res) {
  if (req.session.user) {
    res.redirect("/");
  }
  else {
    res.render("login");
  }
});

/**
 * Log the user in to the system.
 */
app.post("/login", function(req, res) {
  pagetty.login(req.body.name, req.body.pass, function(err, user) {
    if (err) {
      res.send(400);
    }
    else {
      req.session.user = user;
      res.send(200);
    }
  });
});

/**
 * Log the user out of the system.
 */
app.get("/logout", function(req, res) {
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
 * Initialize the application.
 */
pagetty.init(function (self) {
  var httpPort = config.port_shift + 80, httpsPort = config.port_shift + 443;

  logger.log.info("Starting server on ports: " + httpsPort + " and " + httpPort);
  app.listen(httpsPort);
  http.listen(httpPort);
});
