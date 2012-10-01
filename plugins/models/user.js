exports.attach = function(options) {
  var app = this;
  var _ = require('underscore');
  var $ = require('cheerio');
  var async = require('async');
  var check = require('validator').check;
  var mongoose = require('mongoose');
  var uri = require('url');

  var userSchema = mongoose.Schema({
    created: Date,
    name: String,
    mail: String,
    pass: String,
    subscriptions: mongoose.Schema.Types.Mixed,
    state: mongoose.Schema.Types.Mixed,
    verified: Boolean,
  });

  /**
   * Subscribe user to a given channel.
   */
  userSchema.methods.subscribe = function(url, callback) {
    var self = this, channel = false, name = false;

    var urlComponents = uri.parse(url);

    async.series([
      // Check that the URL is valid.
      function(next) {
        try {
          check(url, "URL is required.").notEmpty();
          check(url, "URL is not valid.").isUrl();
        } catch (e) {
          next(e.message);
          return;
        }
        next();
      },
      // Check that the channel exists and create it if necessary.
      function(next) {
        app.channel.findOne({url: url}, function(err, doc) {
          if (doc) {
            channel = doc;
            next();
          }
          else {
            channel = new app.channel({url: url, domain: urlComponents.hostname});
            channel.save(function(err) {
              next(err);
            });
          }
        });
      },
      // Check that the user is not yet subscribed.
      function(next) {
        if (self.subscriptions[channel._id]) {
          next("You are already subscribed to this site.");
        }
        else {
          next();
        }
      },
      // Update channel items.
      function(next) {
        channel.updateItems(true, function() {
          next();
        });
      },
      // Add channel to user's subscriptions.
      function(next) {
        self.updateSubscription(channel._id, {name: urlComponents.hostname}, function(err) {
          err ? next("Could not update user subscription.") : next();
        });
      },
      // Increment channel's subscribers counter.
      function(next) {
        channel.updateSubscriberCount(function(err) {
          err ? next("Could not increment subscribers.") : next();
        });
      }
    ], function(err) {

      console.log(err);
      callback(err, channel);
    });
  }

  /**
   * Update the user's subscription information. Currently only name.
   */
  userSchema.methods.updateSubscription = function(channel_id, data, callback) {
    var validator = app.getValidator();

    validator.check(data.name, "Name must start with a character.").is(/\w+.*/);

    if (validator.hasErrors()) {
      callback(validator.getErrors()[0]);
    }
    else {
      this.subscriptions[channel_id] = data;
      this.markModified('subscriptions');

      this.save(function(err) {
        callback(err);
      });
    }
  }

  /**
   * Unsubscribe user from a given channel.
   */
  userSchema.methods.unsubscribe = function(channel_id, callback) {
    var self = this, channel = false;

    async.series([
      function(next) {
        app.channel.findById(channel_id, function(err, doc) {
          channel = doc;
          next(err);
        });
      },
      function(next) {
        delete self.subscriptions[channel_id];
        self.markModified('subscriptions');
        self.save(function(err) {
          channel.updateSubscriberCount(function(err) {
            next(err);
          });
        });
      },
    ], function(err) {
      callback(err);
    });
  }

  /**
   * Load all the channels the given user has subscribed to.
   */
  userSchema.methods.subscribedChannels = function(callback) {
    var subscriptions = [];

    for (var channel_id in this.subscriptions) {
      subscriptions.push(app.objectId(channel_id));
    }

    app.channel.find({_id: {$in: subscriptions}}, function(err, channels) {
      if (err) {
        throw err;
      }
      else {
        callback(channels);
      }
    });
  }

  /**
   * Load all channels that have been updated since the user last requested them.
   */
  userSchema.methods.getChannelUpdates = function(state, callback) {
    var self = this;
    var ids = [];
    var updates = [];

    if (state) {
      for (var id in state) {
        ids.push(app.objectId(id));
      }

      app.channel.find({_id: {$in: ids}}, function(err, results) {
        if (err) throw err;

        for (var i in results) {
          var time = results[i].items_added ? results[i].items_added.getTime() : 0;

          if ((time > new Date(state[results[i]._id]))) {
            for (var j = 0; j < results[i].items.length; j++) {
              results[i].items[j].created = results[i].items[j].created.getTime();
            }

            updates.push({_id: results[i]._id, items_added: results[i].items_added.getTime(), items: results[i].items});
          }
        }

        callback(updates);
      });
    }
    else {
      callback([]);
    }
  }

  /**
   * Activate the user account and set the username, password.
   */
  userSchema.methods.activate = function(callback) {
    var sequence = futures.sequence();
    var validator = this.getValidator();
    var self = this;

    validator.check(account.name, 'Username is required.').notEmpty();
    validator.check(account.name, 'Name must start with a character.').is(/\w+.*/);
    validator.check(account.pass, 'Password is required.').notEmpty();
    validator.check(account.pass, 'Password must contain at least 6 characters.').len(6);
    validator.check(account.pass, 'Passwords do not match.').equals(account.pass2);

    sequence.then(function(next) {
      self.checkIfUsernameUnique(account.name, function(exists) {
        if (exists) validator.error("Username already exists.");
        next();
      })
    })
    .then(function(next) {
      if (validator.hasErrors()) {
        callback(validator.getErrors());
        return;
      }
      else {
        next();
      }
    })
    .then(function(next) {
      var updates = {
        "$set": {verified: true, name: account.name, pass: self.hashPassword(account.user_id, account.pass)}
      }

      app.user.update({_id: app.objectId(account.user_id)}, updates, function(err) {
        if (err) throw err;
        callback();
      });
    })
  }

  userSchema.statics.signup = function(mail, callback) {
    var self = this;

    try {
      check(mail).notEmpty().isEmail();
    }
    catch (e) {
      callback("E-mail is not valid.");
      return;
    }

    app.user.findOne({mail: mail}, function(err, doc) {
      if (err) {
        callback("Could not check mail.");
      }
      else if (doc != null) {
        callback("Mail is already in use.");
      }
      else {
        var user = new User({mail: mail, created: new Date(), verified: false});

        user.save(function(err) {
          if (err) {
            callback("Error while creating user account.");
          }
          else {
            self.mail({to: user.mail, subject: "Welcome to pagetty.com", user: user}, 'signup');
            callback(null, docs[0]);
          }
        });
      }
    });
  }

  /**
   * Check the user's login credentials.
   */
  userSchema.statics.authenticate = function(name, plainPass, callback) {
    var self = this;

    this.findOne({name: name}, function(err, user) {
      if (user == null || user.pass != self.hashPassword(user._id, plainPass)) {
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
   * Check if the given username is unique.
   */
  userSchema.statics.checkIfUsernameUnique = function(username, callback) {
    this.findOne({name: username}, function(err, doc) {
      callback(err == null && doc != null);
    });
  }

  /**
   * Verify the user's account.
   */
  userSchema.statics.checkIfUnverified = function(user_id, callback) {
    this.findOne({_id: id, verified: false}, function(err, doc) {
      if (err || (doc == null)) {
        if (err) throw err;
        callback('User not found or already verified.')
      }
      else {
        callback();
      }
    });
  }

  this.user = this.db.model('User', userSchema, 'users');
}
