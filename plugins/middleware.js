exports.attach = function (options) {
  var app = this;
  var fs = require("fs");
  var hash = require("mhash").hash;
  var im = require("imagemagick");

  app.middleware = {
    /**
     * Redirect to HTTPS if the request comes via HTTP.
     */
    forceHTTPS: function(req, res, next) {
      req.connection.encrypted ? next() : res.redirect("https://" + app.conf.host + req.url);
    },

    /**
     * Add common variables to views.
     */
    locals: function(req, res, next) {
      res.locals.build = hash('adler32', app.build);
      res.locals.variants = app.list.variants();
      res.locals._csrf = req.session._csrf;
      next();
    },

    /**
     * Request logging.
     */
    logger: function(req, res, next) {
      req._startTime = new Date;

      var end = res.end;
      res.end = function(chunk, encoding){
        res.end = end;
        res.end(chunk, encoding);
        app.logAccess(req.ip, req.method, res.statusCode, (new Date() - req._startTime) + "ms", req.url, "-", req.headers['user-agent']);
      };

      next();
    },

    /**
     * CSRF check for selected requests.
     */
    csrf: function(req, res, next) {
      if ((req.body && req.body._csrf == req.session._csrf) || (req.query && req.query._csrf == req.session._csrf) || (req.headers['x-csrf-token'] == req.session._csrf)) {
        next();
      }
      else {
        next("Access denied.");
      }
    },

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
      function init() {
        // generate CSRF token
        req.session._csrf || (req.session._csrf = hash('sha1', req.sessionID + "thanksJan"));

        if (req.session.user) {
          // Updates the user object, since it may have changed.
          app.user.findById(req.session.user._id, function(err, user) {
            req.session.user = user;
            next();
          });
        }
        else {
          next();
        }
      }

      if (1 && (req.url == "/auth/facebook" || req.url == "/auth/google")) {
        app.log("Regenerating session before login");
        req.session.regenerate(function(err) {
          init();
        });
      }
      else {
        init();
      }
    },
  };
}

exports.init = function(done) {
  var app = this;

  app.everyauth.google
    .appId(app.conf.google.clientId)
    .appSecret(app.conf.google.clientSecret)
    .scope(['https://www.googleapis.com/auth/userinfo.email http://www.google.com/reader/api'])
    .authQueryParam({approval_prompt:'auto'})
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
          app.notify.onSignin(user, "Google");
          promise.fulfill(user);
        }
      });

      return promise;
    })
    .redirectPath('/front');

  app.everyauth.facebook
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
          app.notify.onSignin(user, "Facebook");
          promise.fulfill(user);
        }
      });

      return promise;
    })
    .redirectPath('/front');

  app.everyauth.everymodule.userPkey('_id');
  app.everyauth.everymodule.findUserById(function (user_id, callback) {
    app.user.findById(user_id, callback);
  });

  app.server.use(app.everyauth.middleware());

  done();
}