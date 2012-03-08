var
_          = require('underscore'),
$          = require('jquery'),
check      = require('validator').check,
config     = require('config').server,
crypto     = require('crypto'),
domino     = require('domino'),
each       = require('each'),
futures    = require('futures'),
im         = require("imagemagick"),
mongodb    = require('mongodb'),
nodemailer = require("nodemailer"),
request    = require('request'),
sequence   = futures.sequence(),
ObjectID   = require('mongodb').ObjectID,
Validator  = require('validator').Validator,
Zepto      = require('zepto-node');

/**
 * Initialize Pagetty.
 */
var Pagetty = {};

Pagetty.init = function(callback) {
  this.mailTransport = nodemailer.createTransport("SMTP");
  this.connectDatabase(this, function() {
    callback(this);
  });
}

/**
 * Make a database connection.
 */
Pagetty.connectDatabase = function(self, callback) {
  self.dbConnection = new mongodb.Db(config.db_name, new mongodb.Server(config.db_host, config.db_port));
  self.dbConnection.open(function(err, client) {
    if (err) throw err;
    self.db = client;
    self.channels = new mongodb.Collection(self.db, 'channels');
    self.users = new mongodb.Collection(self.db, 'users');
    self.sessions = new mongodb.Collection(self.db, 'sessions');
    callback();
  });
}

/**
 * Load a given user from database.
 */
Pagetty.loadUser = function(id, callback) {
  this.users.findOne({_id: id}, function(err, user) {
    if (err) throw err;
    callback(user);
  });
}

/**
 * Load a single channel. Callback format: callback(err, docs);
 */
Pagetty.loadChannel = function(id, callback) {
  this.channels.findOne({_id: new ObjectID(id)}, callback);
}

/**
 * Load all the channels the given user has subscribed to.
 * SYNC!
 */
Pagetty.loadUserChannels = function(user, callback) {
  var channels = {};
  //_id: {$in: user.subscriptions}
  this.channels.find({}).toArray(function(err, result) {
    if (err) throw err;

    for (i in result) {
      channels[result[i]._id] = result[i];
    }
    callback(channels);
  });
}

/**
 * Load all channels from database.
 */
Pagetty.loadAllChannels = function(callback) {
  this.channels.find().toArray(function(err, result) {
    if (err) {
      console.log(err);
      callback(err);
    }
    else {
      var channels = {};

      for (i in result) {
        channels[result[i]._id] = result[i];
      }
      callback(false, channels);
    }
  });
}

Pagetty.loadChannelsForUpdate = function(callback) {
  var max_lifetime = 15; // in minutes.
  var now = new Date();
  var check = new Date(now.getTime() - (max_lifetime * 60000));
  return this.channels.find({$or: [{items_updated: {$exists: false}}, {items_updated: {$lt: check}}]});
}

Pagetty.loadUserChannelUpdates = function(user, state, callback) {
  var updates = {};
  var channels = [];

  for (var i in state.channels) {
    channels.push(i);
  }

  this.channels.find({_id: {$in: channels}}).toArray(function(err, results) {
    if (err) {
      console.log(err);
      process.exit();
    }
    else {
      for (var i in results) {
        if (results[i].items_added > state.channels[results[i]._id]) {
          updates[results[i]._id] = results[i];
        }
      }
      callback(updates);
    }
  });
}

/**
 * Update items for the given channel.
 */
Pagetty.updateChannelItems = function(channel, callback) {
  var self = this;

  this.fetchChannelItems(channel, function(err, updated_channel) {
    if (err) {
      console.log(err);
      callback();
    }
    else {
      for (var i in updated_channel.items) {
        if (!updated_channel.items[i].id) updated_channel.items[i].id = self.createObjectID();
      }

      self.channels.update({_id: updated_channel._id}, updated_channel, {}, function(err) {
        if (err) {
          console.log(err);
        }
        callback();
      });
    }
  })
}

Pagetty.createChannel = function(channel, callback) {
  this.channels.insert(channel, {safe: true}, function(err, doc) {
    if (err) {
      console.log(err);
      callback(err);
    }
    else {
      callback(false, doc[0]);
    }
  });
}

/**
 * J‰‰nus?
 */
Pagetty.updateChannel = function(channel, callback) {
  var id = new ObjectID(channel._id);
  delete channel._id;

  this.channels.update({_id: id}, channel, {safe: true}, function(err) {
    if (err) throw err;
    callback();
  });
}

/**
 * Fetch fresh items for the given channel.
 */
Pagetty.fetchChannelItems = function(channel, callback) {
  var self = this, now = new Date();

  this.fetchData({url: channel.url})
    .done(function(err, response, body) {
      if (err) {
        callback(err);
      }
      else {
        var items = self.processData(body, channel);

        if (items.length) {
          channel.items_updated = now;
          channel.items_added = self.compareItems(channel.items, items) ? channel.items_added : now;
          channel.items = items;
          callback(false, channel);
        }
        else {
          callback('No items found.');
        }
      }
    });
}

Pagetty.compareItems = function(previous, current) {
  for (var i in current) {
    var exists = false;
    for (var j in previous) {
      if (previous[j].target_url == current[i].target_url) {
        exists = true;
        break;
      }
    }
    if (!exists) return false;
  }
  return true;
}

Pagetty.fetchData = function(options) {
  return new $.Deferred(function(dfd) {
    options.timeout = 10000;

    if (options.url == null || !options.url.match(/^(http|https):\/\//)) {
      dfd.resolve("Invalid URL.");
      return;
    }

    request(options, function(err, response, body) {
      dfd.resolve(err, response, body);
    });
  }).promise();
}

Pagetty.processData = function(response, channel) {
  var
    items = [];
    now = new Date();
    this.window = domino.createWindow(response);
    this.zepto = Zepto(this.window);

  for (i in channel.rules) {
    try {
      var elements = this.zepto(channel.rules[i].item).get();
    }
    catch(err) {
      console.log(err);
    }

    for (j in elements) {
      var item = this.processItem(elements[j], channel, channel.rules[i]);

      if (item.title && item.target_url && this.itemIsUnique(item, items)) {
        item.created = this.getCreatedTime(now, item, channel.items);
        items.push(item);
      }
    }
  }

  return items;
}

/**
 * Create an unique ObjectID from current timestamp.
 */
Pagetty.createObjectID = function() {
  return new ObjectID(new Date().getTime() / 1000);
}

Pagetty.getCreatedTime = function(now, item, items) {
  for (var i in items) {
    if (items[i].target_url == item.target_url) {
      return items[i].created ? items[i].created : now;
      break;
    }
  }
  return now;
}

/**
 * Chech that the item's target URL is not present already.
 */
Pagetty.itemIsUnique = function(item, items) {
  for (var i in items) {
    if (items[i].target_url == item.target_url) {
      return false;
    }
  }
  return true;
}

Pagetty.processItem = function(item_data, channel, rule) {
  var item = {
    title: this.processElement(item_data, rule.title_selector, rule.title_attribute),
    target_url: this.processURL(this.processElement(item_data, rule.target_selector, rule.target_attribute), channel),
    image_url: this.processURL(this.processElement(item_data, rule.image_selector, rule.image_attribute), channel),
    score: this.processScore(this.processElement(item_data, rule.score_selector, rule.score_attribute))
  }

  if (item.target_url && item.target_url.match(/\.(jpg|png|gif)$/gi)) item.image_url = item.target_url;
  return item;
}

Pagetty.processElement = function(data, selector, attribute) {
  try {
    if (typeof(selector) == 'undefined') {
      return null;
    }
    else if (attribute) {
      return this.stripTags(this.zepto(data).find(selector).attr(attribute));
    }
    else {
      return this.stripTags(this.zepto(data).find(selector).html());
    }
  }
  catch(err) {
    console.log(err);
  }
};

Pagetty.processURL = function(url, channel) {
  if (url != null && !url.match(/^(http|https):\/\/+/)) {
    var domain = channel.url.match(/^((http|https):\/\/[^\/]+)/)[1];
    return encodeURI(domain + '/' + url.replace(/^\/*/, ''));
  }
  else {
    return url == null ? null : encodeURI(url);
  }
}

Pagetty.processScore = function(string) {
  if (string) {
    return string.replace(/[^0-9.]/g, '');
  }
  else {
    return null;
  }
}

Pagetty.stripTags = function(string) {
  if (string) {
    return string.replace(/<\/?(?!\!)[^>]*>/gi, '');
  }
  else {
    return null;
  }
}

Pagetty.validateChannel = function(channel) {
  var validator = this.getValidator();

  validator.check(channel.name, 'Name must start with a character.').is(/\w+.*/);
  validator.check(channel.url, 'URL is not valid.').is(/(http|https):\/\/.+\..+/);

  _.each(channel.rules, function(rule) {
    validator.check(rule.item, 'Item selector is always required.').notEmpty();
    validator.check(rule.title_selector, 'Title selector is always required.').notEmpty();
    validator.check(rule.target_selector, 'Target selector is always required.').notEmpty();
  });

  if (validator.hasErrors()) {
    return validator.getErrors();
  }
  else {
    return [];
  }
}

/**
 * Attach Mustache templating functions to channel objects.
 */
Pagetty.attachChannelTemplating = function(channel) {
  var self = this;

  channel.subscription_status = function(text, render) {
    if (_.isUndefined(self.user.subscriptions)) {
      return 'unsubscribed';
    }
    else {
      return (self.user.subscriptions.indexOf(this._id.toString()) == -1) ? 'unsubscribed': 'subscribed';
    }
  }

  return channel;
}

Pagetty.signup = function(mail, callback) {
  var self = this;

  try {
    check(mail).notEmpty().isEmail();
  }
  catch (e) {
    callback("E-mail is not valid.");
    return;
  }

  this.users.findOne({mail: mail}, function(err, doc) {
    if (err) {
      callback("Could not check mail.");
    }
    else if (doc != null) {
      callback("Mail is already in use.");
    }
    else {
      self.users.insert({mail: mail, created: new Date(), verified: false}, function(err, docs) {
        var user = docs[0];

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
 * Activate the user account and set the username, password.
 */
Pagetty.activate = function(account, callback) {
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

    self.users.update({_id: new ObjectID(account.user_id)}, updates, function(err) {
      if (err) throw err;
      callback();
    });
  })
}

/**
 * Check the user's login credentials.
 */
Pagetty.checkLogin = function(name, pass, callback) {
  var self = this;

  this.users.findOne({name: name}, function(err, user) {
    if (err) {
      throw err;
    }
    else {
      if (user == null || user.pass != self.hashPassword(user._id, pass)) {
        callback("Username or password does not match.");
      }
      else {
        callback(null, user);
      }
    }
  });
}

/**
 * Create a secure hash from user_id + plain password pair.
 */
Pagetty.hashPassword = function(id, plain) {
  var hash = crypto.createHash('sha1');
  hash.update(',lwe‰rw3p29' + id + plain, 'utf8');
  return hash.digest('hex');
}

/**
 * Check if the given username is unique.
 */
Pagetty.checkIfUsernameUnique = function(username, callback) {
  this.users.findOne({name: username}, function(err, doc) {
    if (err) throw err;
    callback(doc != null);
  });
}

/**
 * Subscribe user to a given channel.
 */
Pagetty.subscribe = function(user_id, channel_id, callback) {
  var self = this, sequence = futures.sequence();

  sequence.then(function(next) {
    // Check that the channel really exists.
    self.channels.findOne({_id: channel_id}, function(err, doc) {
      err ? callback('Channel not found.') : next();
    });
  })
  .then(function(next) {
    // Check that the user really exists and is not already subscribed.
    self.users.findOne({_id: user_id, subscriptions: {'$nin': [channel_id]}}, function(err, doc) {
      err || (doc == null) ? callback('User not found or already subscribed.') : next();
    });
  })
  .then(function(next) {
    // Add channel to user's subscriptions.
    self.users.update({_id: user_id}, {'$addToSet': {subscriptions: channel_id}}, function(err) {
      err ? callback('Could not add subscription.') : next();
    });
  })
  .then(function(next) {
    // Increment channel's subscribers counter.
    self.channels.update({_id: channel_id}, {'$inc': {subscriptions: 1}}, function(err) {
      err ? callback('Could not increment subscribers.') : callback();
    });
  })
}

/**
 * Unsubscribe user from a given channel.
 */
Pagetty.unsubscribe = function(user_id, channel_id, callback) {
  var self = this, sequence = futures.sequence();

  sequence.then(function(next) {
    // Check that the user really exists and is not already subscribed.
    self.users.findOne({_id: user_id, subscriptions: {'$in': [channel_id]}}, function(err, doc) {
      err || (doc == null) ? callback('User not found or not subscribed.') : next();
    });
  })
  .then(function(next) {
    // Remove channel from user's subscriptions.
    self.users.update({_id: user_id}, {'$pull': {subscriptions: channel_id}}, function(err) {
      err ? callback('Could not add subscription.') : next();
    });
  })
  .then(function(next) {
    // Decrement channel's subscribers counter.
    self.channels.update({_id: channel_id}, {'$inc': {subscriptions: -1}}, function(err) {
      err ? callback('Could not increment subscribers.') : callback();
    });
  })
}

/**
 * Verify the user's account.
 */
Pagetty.checkIfUserUnverified = function(user_id, callback) {
  var id = new ObjectID(user_id);

  this.users.findOne({_id: id, verified: false}, function(err, doc) {
    if (err || (doc == null)) {
      if (err) throw err;
      callback('User not found or already verified.')
    }
    else {
      callback();
    }
  });
}

/**
 * Build a custom validator that does not throw exceptions.
 */
Pagetty.getValidator = function() {
  var validator = new Validator();

  validator.error = function (msg) {
    this._errors.push(msg);
  }

  validator.hasErrors = function () {
    return this._errors.length;
  }

  validator.getErrors = function () {
    return this._errors;
  }

  return validator;
}

Pagetty.mail = function(mail, template) {
  var
    hogan = require('hogan.js'),
    sequence = futures.sequence(),
    body = mail.body,
    self = this;

  sequence.then(function(next) {
    if (template) {
      self.loadTemplate('mail/' + template + '.hulk', function(data) {
        var compiled_template = hogan.compile(data.toString());
        body = compiled_template.render(mail);
        next();
      })
    }
    else {
      next();
    }
  })
  .then(function(next, data) {
    nodemailer.sendMail({
      transport: self.mailTransport,
      from : config.mail.from,
      to : mail.to,
      subject : mail.subject,
      text: body
    },
    function(err) {
      if (err) throw err;
      self.mailTransport.close();
    });
  })
}

Pagetty.loadTemplate = function(file, callback) {
  var fs = require('fs');

  fs.readFile('./templates/' + file, function (err, data) {
    if (err) throw err;
    callback(data);
  });
}

Pagetty.imageCache = function(req, res, next) {
  var maxage = 604800 * 1000;
  var expires = "Thu, 01 Jan 2015 12:00:00 GMT";
  var match = /\/images\/(.+)\.jpg/.exec(req.url);

  if (match) {
    var fs = require('fs');
    var cache_id = match[1];
    var filename = "./images/" + cache_id + ".jpg";

    fs.readFile(filename, function (err, existing_file) {
      if (err) {
        if (err.code == "ENOENT") {
          Pagetty.channels.findOne({items: {$elemMatch: {id: new ObjectID(cache_id)}}}, function(err, channel) {
            if (err) throw err;

            if (channel == null) {
              console.log("Cache item not found: " + cache_id);
              res.writeHead(404);
              res.end("Cache item not found.");
              return;
            }
            else {
              for (var i in channel.items) {
                if (channel.items[i].id == cache_id) {
                  var url = channel.items[i].image_url;
                }
              }

              Pagetty.fetchData({url: url, encoding: null}).done(function(err, response, body) {
                if (err) {
                  console.log("Original unavailable: " + cache_id);
                  res.writeHead(404);
                  res.end("Original unavailable: " + cache_id);
                  return;
                }

                fs.writeFile(filename, body, function (err) {
                  if (err) throw err;

                  im.convert([filename, "-format", "jpg", "-resize", "528>", filename], function(err, metadata){
                    if (err) {
                      fs.unlink(filename);
                      throw err;
                    }

                    fs.readFile(filename, function (err, created_file) {
                      if (err) throw err;

                      res.writeHead(200, {'Content-Type': 'image/jpeg', 'Cache-Control': "public", "Expires": expires});
                      res.end(created_file);
                    });
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
        res.writeHead(200, {'Content-Type': 'image/jpeg', 'Cache-Control': "public", "Expires": expires});
        res.end(existing_file);
      }
    });
  }
  else {
    next();
  }
}

module.exports = Pagetty;