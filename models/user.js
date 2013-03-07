exports.attach = function(options) {
  var app = this;
  var _ = require("underscore");
  var async = require("async");
  var mongoose = require("mongoose");

  var userSchema = mongoose.Schema({
    mail: {type: String, index: {unique: true}},
    pass: String,
    created: Date,
    high: Date,
    low: Date,
    narrow: Boolean,
    verification: {type: String, index: true},
    verified: {type: Boolean, index: true},
  });

  /**
   * Delete all associated data along with the user account.
   */
  userSchema.post('remove', function() {
    var self = this;

    app.list.find({user_id: this._id}).remove(function(err) {
      if (err) console.log(err);
      app.notify.onAccountDelete(self);
    });
  });

  /**
   * Activate the user account and set the username, password.
   */
  userSchema.methods.activate = function(callback) {
    var self = this;

    this.verified = true;

    this.save(function(err) {
      app.notify.onActivate(self);
      callback(err);
    });
  }

  /**
   * Get all user's directories.
   */
  userSchema.methods.getDirectories = function(callback) {
    app.list.find({user_id: this._id, type: "directory"}, function(err, lists) {
      if (err) {
        callback(err);
      }
      else {
        callback(null, lists.sort(function(a ,b) {
          return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
        }));
      }
    });
  }

  /**
   * Activate the user account and set the username, password.
   */
  userSchema.methods.getFreshCounts = function(callback) {
    var self = this;
    var counts = {all: 0};

    app.list.find({user_id: this._id, type: "channel"}, function(err, lists) {
      if (err) {
        app.err("getFreshCounts", err);
        callback(err);
      }
      else {
        async.each(lists, function(list, next) {
          app.item.count({channel_id: list.channel_id, $and: [{created: {$gt: self.low}}, {created: {$lte: self.high}}]}, function(err, count) {
            counts[list._id] = count || 0
            counts.all += counts[list._id];

            if (list.directory_id) {
              if (!counts[list.directory_id]) counts[list.directory_id] = 0;
              counts[list.directory_id] += (count || 0);
            }

            next();
          });
        }, function(err) {
          err ? callback(err) : callback(null, counts);
        });
      }
    });
  }

  /**
   * Subscribe user to a given channel.
   */
  userSchema.methods.subscribe = function(url, callback) {
    var self = this;
    var channel = null;
    var feed = null;
    var list = null;

    async.series([
      // Parse the feed contents.
      function(next) {
        app.parseFeed(url, function(err, parsed_feed) {
          if (err) {
            next(err);
          }
          else {
            feed = parsed_feed;
            next();
          }
        });
      },
      // Check that the channel exists and create it if necessary.
      function(next) {
        app.channel.findOne({url: feed.url}, function(err, doc) {
          if (doc) {
            channel = doc;
            next();
          }
          else {
            channel = new app.channel({type: feed.type, url: feed.url, domain: feed.domain, link: feed.link});
            channel.save(function(err) {
              next(err);
            });
          }
        });
      },
      // Update the channel items.
      function(next) {
        channel.crawl(function() {
          next();
        });
      },
      // Create a list (subscription) for the user.
      function(next) {
        app.list.createFromChannel(self._id, channel, feed.title, function(err, doc) {
          list = doc;
          err ? next("Could not update user subscription.") : next();
        });
      },
      // Increment channel's subscribers counter.
      function(next) {
        channel.updateSubscriberCount(function(err) {
          err ? next("Could not increment subscribers.") : next();
        });
      },
      // Update user's read state.
      function(next) {
        self.updateReadState(function(err) {
          err ? next("Could not update read state.") : next();
        });
      },
    ], function(err) {
      app.notify.onSubscribe(self, channel);
      callback(err, list);
    });
  }

  /**
   * Unsubscribe user from a given channel.
   */
  userSchema.methods.unsubscribe = function(channel_id, callback) {
    var self = this;

    app.list.remove({user_id: self._id, channel_id: channel_id}, function(err) {
      app.channel.findById(channel_id, function(err, channel) {
        channel.updateSubscriberCount(function(err) {
          app.notify.onUnSubscribe(self, channel);
          callback();
        });
      });
    });
  }

  /**
   * Update user read state pointers.
   */
  userSchema.methods.updateReadState = function(callback) {
    this.low = this.high;
    this.high = new Date();
    this.save(function(err) {
      callback(err);
    });
  }

  /**
   * Check the user's login credentials.
   */
  userSchema.statics.authenticate = function(mail, plain_pass, callback) {
    var self = this;

    this.findOne({mail: mail, verified: true}, function(err, user) {
      if (user == null || !(user.pass == self.hashPassword(user._id, plain_pass))) {
        callback("Username or password does not match.");
      }
      else {
        callback(null, user);
      }
    });
  }

  /**
   * Create a secure hash from user_id + plain password pair.
   */
  userSchema.statics.hashPassword = function(id, plainPass) {
    return require('crypto').createHash('sha1').update('lwearGYw3p29' + id + plainPass, 'utf8').digest('hex');
  }

  /**
   * Try to authenticate the user, create an account on the fly if not present.
   */
  userSchema.statics.findOrCreate = function(mail, callback) {
    var date = new Date();

    app.user.findOne({mail: mail}, function(err, user) {
      if (user) {
        callback(null, user);
      }
      else {
        app.user.create({mail: mail, pass: null, created: date, high: date, low: date, narrow: false, verification: null, verified: true}, function(err, user) {
          app.mail({to: user.mail, subject: 'Welcome to pagetty.com'}, 'signup_auto', {user: user});
          callback(err, user);
        });
      }
    });
  }

  /**
   * Create a new unverified user account on signup.
   */
  userSchema.statics.signup = function(data, callback) {
    var validator = app.getValidator();

    validator.check(data.mail, 'E-mail is not valid.').isEmail();
    validator.check(data.pass, 'Password is required.').notEmpty();
    validator.check(data.pass, 'Password must contain at least 6 characters.').len(6);
    validator.check(data.pass, 'Passwords do not match.').equals(data.pass2);

    if (validator.hasErrors()) {
      callback(validator.getErrors()[0]);
      return;
    }

    async.series([
      function(next) {
        app.user.findOne({mail: data.mail}, function(err, user) {
          user == null ? next(null) : next('E-mail is already in use.');
        });
      },
    ], function(err) {
      if (err) {
        callback(err);
      }
      else {
        var id = new mongoose.Types.ObjectId(id);
        var pass = app.user.hashPassword(id.toString(), data.pass);
        var date = new Date();
        var verification = require('crypto').createHash('sha1').update('qwmi39ds' + date.getTime(), 'utf8').digest('hex');
        var user = new app.user({_id: id, mail: data.mail, pass: pass, created: date, high: date, low: date, narrow: false, verification: verification, verified: false});

        user.save(function(err) {
          if (err) {
            callback("Unable to create user account.");
          }
          else {
            app.mail({to: user.mail, subject: 'Welcome to pagetty.com'}, 'signup', {user: user});
            app.notify.onSignup(user);
            callback(null, user);
          }
        });
      }
    });
  }

  this.user = this.db.model('User', userSchema, 'users');
}
