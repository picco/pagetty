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
                  app.err("imagecache", "source item not found", item_id);
                  res.writeHead(404);
                  res.end();
                  return;
                }
                else {
                  app.fetch({url: item.image}, function(err, buffer) {
                    if (err) {
                      app.err("imagecache", "original unavailable", cache_id, item.image);
                      res.writeHead(404);
                      res.end();
                      return;
                    }

                    fs.writeFile(filename, buffer, function (err) {
                      if (err) throw err;

                      var convert_start = new Date().getTime();

                      im.identify(filename, function(err, features) {
                        if (!err && features.width > 32 && features.height > 32) {
                          im.convert([filename, "-flatten", "-strip", "-background", "white", "-resize", "260x260>^", "-gravity", "center", "-extent", "260x260", "-format", "jpg", filename], function(err, metadata){
                            if (err) {
                              fs.unlink(filename);
                              app.err("imagecache", "error generating thumbnail", cache_id, item.image);
                              res.writeHead(500);
                              res.end();
                              return;
                            }
                            else {
                              app.log("imagecache", "image converted", app.timer(convert_start) + "ms", item.image);

                              fs.readFile(filename, function (err, created_file) {
                                if (err) throw err;

                                res.writeHead(200, headers);
                                res.end(created_file);
                                return;
                              });
                            }
                          });
                        }
                        else {
                          res.writeHead(500);
                          res.end();
                          return;
                        }
                      });
                    });
                  });
                }
              });
            }
            else {
              app.err("imagecache", err.toString(), filename);
              res.writeHead(500);
              res.end();
            }
          }
          else {
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
}

exports.init = function(done) {
  var app = this;

  app.everyauth.google
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
          app.notify.onSignin(user, "Google");
          promise.fulfill(user);
        }
      });

      return promise;
    })
    .redirectPath('/');

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
    .redirectPath('/');

  app.everyauth.everymodule.userPkey('_id');
  app.everyauth.everymodule.findUserById(function (user_id, callback) {
    app.user.findById(user_id, callback);
  });

  app.server.use(app.everyauth.middleware());

  done();
}