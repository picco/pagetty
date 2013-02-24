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
      req.connection.encrypted ? next() : res.redirect("https://" + app.conf.domain + req.url);
    },

    /**
     * Add common variables to views.
     */
    locals: function(req, res, next) {
      res.locals.build = hash('adler32', process.env.BUILD);
      res.locals.variants = app.list.variants();
      next();
    },

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

  app.server.use(function(req, res, next) {
    req.connection.encrypted ? next() : res.redirect("https://" + app.conf.domain + req.url);
  });

  app.everyauth.everymodule.userPkey('_id');
  app.everyauth.everymodule.findUserById(function (user_id, callback) {
    app.user.findById(user_id, callback);
  });

  app.server.use(app.everyauth.middleware());

  done();
}