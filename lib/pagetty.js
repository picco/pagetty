var
_          = require('underscore'),
$          = require('jquery'),
async      = require("async"),
check      = require('validator').check,
config     = require('config').server,
cp         = require('child_process'),
crypto     = require('crypto'),
futures    = require('futures'),
im         = require("imagemagick"),
logger     = require(__dirname + "/logger.js");
mongodb    = require('mongodb'),
nodemailer = require("nodemailer"),
parser     = require(__dirname + "/parser.js");
request    = require('request'),
sequence   = futures.sequence(),
uri        = require("url");
ObjectID   = require('mongodb').ObjectID,
Validator  = require('validator').Validator

/**
 * Initialize Pagetty.
 */
var Pagetty = {};

Pagetty.init = function(callback) {
  // Authenticated user object will be loaded by Pagetty.session() middleware.
  this.user = false;

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
    self.channels = new mongodb.Collection(self.db, "channels");
    self.rules = new mongodb.Collection(self.db, "rules");
    self.users = new mongodb.Collection(self.db, "users");
    self.history = new mongodb.Collection(self.db, "history");
    self.sessions = new mongodb.Collection(self.db, "sessions");

    logger.log.info("Database connection established");
    callback();
  });
}

/**
 * Load a given user from database.
 */
Pagetty.loadUser = function(id, callback) {
  this.users.findOne({_id: this.objectId(id)}, function(err, user) {
    if (err) throw err;
    // Remove the password hash, since user objects will be sent to the browser.
    delete user.pass;
    callback(user);
  });
}

/**
 * Load a single channel. Callback format: callback(err, docs);
 */
Pagetty.loadChannel = function(id, callback) {
  this.channels.findOne({_id: this.objectId(id)}, callback);
}

/**
 * Load all the channels the given user has subscribed to.
 */
Pagetty.loadSubscribedChannels = function(user, callback) {
  this.channels.find({_id: {$in: this.getSubscribedChannels(user)}}).toArray(function(err, channels) {
    if (err) {
      throw err;
    }
    else {
      callback(channels);
    }
  });
}

Pagetty.saveRules = function(channel_id, rules, callback) {
  var params = {}, self = this;

  async.series([
    // Load channel.
    function(callback) {
      self.loadChannel(channel_id, function(err, channel) {
        if (err) {
          callback("Channel not found.");
        }
        else {
          params.channel = channel;
          callback();
        }
      });
    },
    // Delete existing rules for the domain.
    function(callback) {
      self.rules.remove({domain: params.channel.domain}, function(err) {
        callback(err);
      });
    },
    // Insert and update rules.
    function(callback) {
      for (var i in rules) {
        rules[i].domain = params.channel.domain;
        rules[i].url = params.channel.url;
        self.rules.insert(rules[i]);
      }

      callback();
    }
  ], function(err) {
    callback();
  });
}

/**
 * Returns all the subscribed channel id's as an array.
 */
Pagetty.getSubscribedChannels = function(user) {
  var subscriptions = [];

  for (var channel_id in user.subscriptions) {
    subscriptions.push(new ObjectID(channel_id));
  }

  return subscriptions;
}

/**
 * Load all the rules matching the given criteria.
 */
Pagetty.loadRules = function(args, callback) {
  this.rules.find(args).toArray(function(err, rules) {
    if (err) throw err;
    callback(rules);
  });
}

/**
 * Load all channels that have been updated since the user last requested them.
 */
Pagetty.loadUserChannelUpdates = function(user, state, callback) {
  var updates = [], ids = [], now = new Date(), returnTestItem = false;

  if (state) {
    for (var id in state.channels) {
      ids.push(new ObjectID(id));
    }

    this.channels.find({_id: {$in: ids}}).toArray(function(err, results) {
      if (err) throw err;

      for (var i in results) {
        if (returnTestItem) {
          results[i].items[0]._id = now;
          results[i].items[0].title += " - update test @" + now.getTime();
          results[i].items[0].created = now;

          updates.push({
            _id: results[i]._id,
            items_added: now,
            items: results[i].items
          });
          break;
        }
        else {
          if ((results[i].items_added > new Date(state.channels[results[i]._id]))) {
            updates.push({
              _id: results[i]._id,
              items_added: results[i].items_added,
              items: results[i].items
            });
          }
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
 * Update items for the given channel.
 */
Pagetty.updateChannelItems = function(channel_id, callback) {
  var self = this;
  var max_lifetime = 10; // in minutes.
  var now = new Date();
  var check = new Date(now.getTime() - (max_lifetime * 60000));

  if (channel_id) {
    var query = {_id: this.objectId(channel_id)};
  }
  else {
    var query = {$or: [{items_updated: {$exists: false}}, {items_updated: {$lt: check}}]};
  }

  this.channels.find(query).each(function(err, channel) {
    if (err) throw err;

    if (channel) {
      self.fetchChannelItems(channel, function(err, new_items) {
        if (err) throw err;

        self.syncItems(channel, new_items, function(updated_channel) {
          self.channels.update({_id: updated_channel._id}, updated_channel, {}, function(err) {
            if (err) throw err;
            callback();
          });
        });
      });
    }
    else {
      callback();
    }
  });
}

/**
 * Fetch fresh items for the given channel.
 */
Pagetty.fetchChannelItems = function(channel, callback) {
  var self = this, c = cp.fork(__dirname + "/parser.js");

  this.request({url: channel.url}, function(err, response, body) {
    if (err) {
      callback(err);
    }
    else {
      self.rules.find({$or: [{url: channel.url}, {domain: channel.domain}]}).toArray(function(err, rules) {
        if (err) throw err;

        c.send({html: body, channel: channel, rules: rules});
        c.on("message", function(items) {
          c.kill();
          callback(false, items);
        });
      });
    }
  });
}

/**
 * Update the channel.
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
 * Create a channel.
 */
Pagetty.createChannel = function(channel, callback) {
  this.channels.insert(channel, function(err, doc) {
    if (err) logger.log.error(err); callback(err, doc[0]);
  });
}

/**
 * Create a rule.
 */
Pagetty.createRule = function(rule, callback) {
  this.rules.insert(rule, function(err, doc) {
    if (err) logger.log.error(err); callback(err, doc[0]);
  });
}

/**
 * Update the existing items with new data while preserving existing item id.
 */
Pagetty.syncItems = function(channel, new_items, callback) {
  var items = [], synced_items = [], now = new Date(), new_items_found = false, self = this, counter = 0, tmp_item;

  if (channel.items && channel.items.length) synced_items = channel.items;

  if (new_items.length) {
    for (var i in new_items) {
      var exists = false;

      for (var j in synced_items) {
        if (synced_items[j].target == new_items[i].target) {
          exists = true;
          tmp_item = synced_items[j];
          synced_items[j] = new_items[i];
          synced_items[j].id = tmp_item.id;
          break;
        }
      }

      if (!exists) {
        tmp_item = new_items[i];
        tmp_item.created = tmp_item.created ? tmp_item.created : null;
        tmp_item.id = self.createObjectID();
        synced_items.push(tmp_item);
      }
    }
  }

  channel.items_updated = now;

  _.each(synced_items, function(item, key) {
    if (item.created == null) {
      self.history.findOne({"item.target": item.target}, function(err, doc) {
        if (err) throw err;

        if (doc == null) {
          // The item is not found in history, treat as new.
          item.created = now;
          channel.items_added = now;
          self.history.insert({channel: channel._id, item: item}, function(err) {
            if (err) logger.log.error("History write failed: " + err);
          });
        }
        else {
          // The item is present in the history, use the old "created" date.
          item.created = doc.item.created;
        }

        items.push(item);

        if (synced_items.length == items.length) {
          channel.items = self.calculateRelativeScore(items);
          callback(channel);
        }
      });
    }
    else {
      items.push(item);

      if (synced_items.length == items.length) {
        channel.items = self.calculateRelativeScore(items);
        callback(channel);
      }
    }
  });
}

/**
 * Calculate the relative scores of all items on a channel.
 */
Pagetty.calculateRelativeScore = function(items) {
  var min = null, max = 0, score = 0;

  for (i in items) {
    score = parseFloat(items[i].score);
    if (score >= max) max = score;

    if (min == null) {
      if (score > 0) min = score;
    }
    else {
      if (score < min) min = score;
    }
  }

  if (min == null) min = 0;

  for (i in items) {
    score = parseFloat(items[i].score);
    score = new Number((score - min) / (max - min)).toPrecision(4);
    items[i].relative_score = (score == "NaN") ? 0 : score;
  }

  return items;
}

/**
 * Request data from the given URL.
 */
Pagetty.request = function(options, callback) {
  var r = request.defaults({timeout: 10000});

  if (options.url == null || !options.url.match(/^(http|https):\/\//)) {
    callback("Invalid URL: " + options.url);
    return;
  }

  r.get(options, function(err, response, body) {
    if (response.statusCode == 403 && 0) {
      callback("HTTP 403: Access denied");
    }
    else if (response.statusCode == 404 && 0) {
      callback("HTTP 404: Not found");
    }
    else {
      callback(null, response, body);
    }
  }).on("error", function(err) {
    callback(err);
  });
}

/**
 * Create an unique ObjectID from current timestamp.
 */
Pagetty.createObjectID = function() {
  return new ObjectID(new Date().getTime() / 1000);
}

Pagetty.getCreatedTime = function(now, item, channel) {
  for (var i in channel.items) {
    if (channel.items[i].target == item.target) {
      return items[i].created ? items[i].created : now;
      break;
    }
  }

  return now;
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
Pagetty.authenticate = function(name, pass, callback) {
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
  hash.update(',lweärw3p29' + id + plain, 'utf8');
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
Pagetty.subscribe = function(options, callback) {
  var self = this, channel = false, name = false;

  async.series([
    // Chech that the URL is valid.
    function(next) {
      try {
        check(options.url, "URL is required.").notEmpty();
        check(options.url, "URL is not valid.").isUrl();
      } catch (e) {
        next(e.message);
        return;
      }
      next();
    },
    // Check that the URL returns some usable data and extract site name.
    function(next) {
      self.request({url: options.url}, function(err, response, body) {
        if (err || !body.length) {
          next("Unable to access the site.");
        }
        else {
         name = $("title", body).text() || options.url;
         next();
        }
      });
    },
    // Check that the channel exists and create it if necessary.
    function(next) {
      self.channels.findOne({url: options.url}, function(err, doc) {
        if (doc) {
          channel = doc;
          next();
        }
        else {
          var urlComponents = uri.parse(options.url);

          self.channels.insert({url: options.url, domain: urlComponents.hostname}, function(err, docs) {
            channel = docs[0];
            next();
          });
        }
      });
    },
    // Update channel items.
    function(next) {
      self.updateChannelItems(channel._id, function() {
        next();
      });
    },
    // Check that the user is not yet subscribed.
    function(next) {
      self.users.findOne({_id: self.objectId(options.user_id)}, function(err, user) {
        if (err || (user == null)) {
          next("User not found.");
        }
        else {
          for (var channel_id in user.subscriptions) {
            if (channel_id == channel._id) {
              next("Already subscribed.");
              return;
            }
          }

          next();
        }
      });
    },
    // Add channel to user's subscriptions.
    function(next) {
      var query = {}; query["subscriptions." + channel._id] = {name: name};
      self.users.update({_id: self.objectId(options.user_id)}, {$set: query}, function(err) {
        err ? next("Could not add subscription.") : next();
      });
    },
    // Increment channel's subscribers counter.
    function(next) {
      self.channels.update({_id: self.objectId(channel._id)}, {'$inc': {subscriptions: 1}}, function(err) {
        err ? next("Could not increment subscribers.") : next();
      });
    }
  ], function(err) {
    callback(err, channel);
  });
}

/**
 * Update the user's subscription information. Currently only name.
 */
Pagetty.updateSubscription = function(user_id, channel_id, data, callback) {
  var query = {}; query["subscriptions." + channel_id] = data;
  this.users.update({_id: this.objectId(user_id)}, {$set: query}, {safe: true}, function(err) {
    callback(err);
  });
}

/**
 * Unsubscribe user from a given channel.
 */
Pagetty.unsubscribe = function(user_id, channel_id, callback) {
  var self = this;

  async.series([
    // Check that the user really exists and is not already subscribed.
    function(next) {
      var query = {_id: self.objectId(user_id)};
      query["subscriptions." + channel_id] = {$exists: true};

      self.users.findOne(query, function(err, doc) {
        err || (doc == null) ? next("User not found or not subscribed.") : next();
      });
    },
    // Remove channel from user's subscriptions.
    function(next) {
      var unset = {}; unset["subscriptions." + channel_id] = 1;
      var query = {$unset: unset};
      self.users.update({_id: self.objectId(user_id)}, query, function(err) {
        err ? next("Could not remove subscription.") : next();
      });
    },
    // Decrement channel's subscribers counter.
    function(next) {
      self.channels.update({_id: self.objectId(channel_id)}, {'$inc': {subscriptions: -1}}, function(err) {
        err ? next("Could not decrement subscribers.") : next();
      });
    }
  ], function(err) {
    callback(err);
  });
}

Pagetty.objectId = function(id) {
  return (typeof id == "object") ? id : new ObjectID(id);
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

/**
 * Express session middleware.
 */
Pagetty.session = function(req, res, next) {
  if (req.session.userId) {
    Pagetty.loadUser(req.session.userId, function(user) {
      Pagetty.user = user;
      next();
    });
  }
  else {
    next();
  }
}

Pagetty.headers = function(req, res, next) {
  //console.dir(res.contentType());
  next();
}

/**
 * Express middleware for serving cached images.
 */
Pagetty.imageCache = function(req, res, next) {
  var self = this;
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
              logger.log.error("Cache item not found: " + cache_id);
              res.writeHead(404);
              res.end("Cache item not found.");
              return;
            }
            else {
              for (var i in channel.items) {
                if (channel.items[i].id == cache_id) {
                  var url = channel.items[i].image;
                  console.log(url);
                }
              }

              Pagetty.request({url: url, encoding: null}, function(err, response, body) {
                if (err) {
                  logger.log.error("Original unavailable: " + cache_id);
                  res.writeHead(404);
                  res.end("Original unavailable: " + cache_id);
                  return;
                }

                fs.writeFile(filename, body, function (err) {
                  if (err) throw err;

                  var convertStart = new Date().getTime();

                  im.convert([filename, "-format", "jpg", "-resize", "538>", filename], function(err, metadata){
                    if (err) {
                      fs.unlink(filename);
                      res.writeHead(500);
                      res.end("Error generating thumbnail from: " + url);
                      console.log("Error generating thumbnail from: " + url);
                      return;
                    }
                    else {
                      logger.log.info("Image at " + url + " conveted in: " + Pagetty.timer(convertStart) + "ms");

                      fs.readFile(filename, function (err, created_file) {
                        if (err) throw err;

                        res.writeHead(200, {'Content-Type': 'image/jpeg', 'Cache-Control': "public", "Expires": expires});
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
        //logger.log.info("Served image from cache. Cache id: " + cache_id);
        res.writeHead(200, {'Content-Type': 'image/jpeg', 'Cache-Control': "public", "Expires": expires});
        res.end(existing_file);
      }
    });
  }
  else {
    next();
  }
}

Pagetty.timer = function(start) {
  var end = new Date().getTime();
  return Math.floor(end - start);
}

module.exports = Pagetty;