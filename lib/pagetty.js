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
util       = require("util");
ObjectID   = require('mongodb').ObjectID,
Validator  = require('validator').Validator
zlib       = require("zlib");

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
    self.channels = new mongodb.Collection(self.db, "channels");
    self.rules = new mongodb.Collection(self.db, "rules");
    self.users = new mongodb.Collection(self.db, "users");
    self.history = new mongodb.Collection(self.db, "history");
    self.sessions = new mongodb.Collection(self.db, "sessions");

    // Create indexes if necessary.
    // self.channels.ensureIndex({"items.id": 1}, {unique: true, dropDups: true}, function(err) { console.log(err) });

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

Pagetty.loadDemoAccount = function() {
  return {
    name: "Demo User",
    subscriptions: {
      "4fc671f431a5bdc73c000006": {name: "AnandTech"},
      "4fc671f431a5bdc73c00000b": {name: "Smashing Magazine"},
      "4fc671f431a5bdc73c000002": {name: "English Russia"},
      "4fc671f431a5bdc73c00000d": {name: "Mashable"},
      "4fc671f431a5bdc73c000008": {name: "Reddit - Top stories"},
      "4fc671f431a5bdc73c000005": {name: "TechCrunch"},
      "4fc671f431a5bdc73c000010": {name: "YouTube - Sci/Tech"}
    }
  };
}

/**
 * Load demo channels.
 */
Pagetty.loadDemoChannels = function(callback) {
  var demoAccount = this.loadDemoAccount(), demoChannels = [];

  for (var channel_id in demoAccount.subscriptions) {
    demoChannels.push(this.objectId(channel_id));
  }

  this.channels.find({_id: {$in: demoChannels}}).toArray(function(err, channels) {
    if (err) {
      throw err;
    }
    else {
      callback(channels);
    }
  });
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
  var updates = [], ids = [];

  if (state) {
    for (var id in state.channels) {
      ids.push(new ObjectID(id));
    }

    this.channels.find({_id: {$in: ids}}).toArray(function(err, results) {
      if (err) throw err;

      for (var i in results) {
        var time = results[i].items_added ? results[i].items_added.getTime() : 0;

        if ((time > new Date(state.channels[results[i]._id]))) {
          for (var j in results[i].items) {
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
 * Update items for the given channel.
 */
Pagetty.updateChannelItems = function(channel_id, callback) {
  var self = this;
  var max_lifetime = 10; // in minutes.
  var now = new Date();
  var check = new Date(now.getTime() - (max_lifetime * 60000));
  var counter = 0;
  var numResults = 0;
  var cursorExhausted = false;

  if (channel_id) {
    var query = {_id: this.objectId(channel_id)};
  }
  else {
    var query = {subscriptions: {$gt: 0}, $or: [{items_updated: {$exists: false}}, {items_updated: null}, {items_updated: {$lt: check}}]};
  }

  this.channels.find(query).sort({items_updated: 1}).limit(10).each(function(err, channel) {
    if (err) throw err;

    if (channel) {
      numResults++;

      self.fetchChannelItems(channel, function(err, new_items) {
        if (err) throw err;

        self.syncItems(channel, new_items, function(updated_channel) {
          self.channels.update({_id: updated_channel._id}, updated_channel, {safe: true}, function(err) {
            if (err) throw err;

            if (++counter == numResults) {
              // All channels are now completed.
              callback();
            }
          });
        });
      });
    }
    else {
      // If there are no results, then we cannot callback otherwise.
      if (!numResults) callback();
    }
  });
}

/**
 * Fetch fresh items for the given channel.
 */
Pagetty.fetchChannelItems = function(channel, callback) {
  var self = this, c = cp.fork(__dirname + "/parser.js");

  this.request({url: channel.url}, function(err, response, buffer, body) {
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

  if (new_items.length) {
    for (var i in new_items) {
      var exists = false;

      for (var j in channel.items) {
        if (channel.items[j].target == new_items[i].target) {
          exists = true;
          tmp_item = new_items[i];
          tmp_item.id = channel.items[j].id;
          synced_items.push(tmp_item);
          break;
        }
      }

      if (!exists) {
        tmp_item = new_items[i];
        tmp_item.id = self.createObjectID();
        tmp_item.created = null;
        synced_items.push(tmp_item);
      }
    }
  }

  channel.items_updated = now;

  if (synced_items.length) {
    _.each(synced_items, function(item, key) {
      if (item.created == null) {
        // This is new item that's not present in current channel items.
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
            // Client side update's don't know how to update themselves otherwise.
            channel.items_added = now;
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
  else {
    callback(channel);
  }
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
  var r = request.defaults({timeout: 10000, encoding: null});

  if (options.url == null || !options.url.match(/^(http|https):\/\//)) {
    callback("Invalid URL: " + options.url);
    return;
  }

  r.get(options, function(err, response, body) {
    if (err) {
      callback(err);
    }
    else if (response.statusCode == 403) {
      callback("HTTP 403: Access denied");
    }
    else if (response.statusCode == 404) {
      callback("HTTP 404: Not found");
    }
    else {
      if (response.headers["content-encoding"] == "gzip") {
        zlib.gunzip(body, function(err, uncompressed) {
          if (err) {
            callback("Unable to parse gzipped content.");
          }
          else {
            callback(null, response, uncompressed, uncompressed.toString());
          }
        });
      }
      else {
        callback(null, response, body, body.toString());
      }
    }
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
      self.request({url: options.url}, function(err, response, buffer, body) {
        if (err || !body.length) {
          next("Unable to access the site.");
        }
        else {
         name = $("title", body).text().trim() || options.url;
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
 * Session middleware for Express.
 */
Pagetty.session = function(req, res, next) {
  if (req.session.user) {
    Pagetty.loadUser(req.session.user._id, function(user) {
      // Updates the user object, since it may have changed.
      req.session.user = user;
      next();
    });
  }
  else {
    next();
  }
}

/**
 * Express middleware for serving cached images.
 */
Pagetty.imageCache = function(req, res, next) {
  var match = /\/imagecache\/([\w\d]{24})\.jpg/.exec(req.url);

  if (match) {

    var fs = require('fs'),
        self = this,
        cache_id = match[1],
        filename = "./imagecache/" + cache_id + ".jpg",
        headers = {
          "Content-Type": "image/jpeg",
          "Cache-Control": "public, max-age=3153600",
          ETag: cache_id
        };

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
                  break;
                }
              }

              Pagetty.request({url: url}, function(err, response, buffer, body) {
                if (err) {
                  logger.log.error("Original unavailable: " + url + " " + cache_id);
                  res.writeHead(404);
                  res.end("Original unavailable: " + url + " " + cache_id);
                  return;
                }

                fs.writeFile(filename, buffer, function (err) {
                  if (err) throw err;

                  var convertStart = new Date().getTime();

                  im.convert([filename, "-flatten", "-background", "white", "-resize", "538>", "-format", "jpg", filename], function(err, metadata){
                    if (err) {
                      fs.unlink(filename);
                      res.writeHead(500);
                      res.end("Error generating thumbnail " + cache_id + " from: " + url);
                      logger.log.error("Error generating thumbnail " + cache_id + " from: " + url);
                      return;
                    }
                    else {
                      logger.log.info("Image at " + url + " conveted in: " + Pagetty.timer(convertStart) + "ms");

                      fs.readFile(filename, function (err, created_file) {
                        if (err) throw err;
                        logger.log.info("Serving resized version: " + cache_id + " from: " + url);
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
        logger.log.info("Serving existing version: " + cache_id);
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

Pagetty.tidy = function(html, callback) {
  var spawn = require('child_process').spawn,
      fs = require('fs'),
      buffer = '',
      err = '';

  var tidy = spawn('tidy',
    [
        '-indent',
        '--quiet', 'y',
        '--markup', 'y',
        '--output-xml', 'y',
        '--input-xml', 'y',
        '--show-warnings', 'n',
        '--quote-nbsp', 'y',
        '--preserve-entities', 'y',
        '--wrap', '0'
    ]);

  tidy.stdout.on('data', function (data) {
    buffer += data;
  });

  tidy.stderr.on('data', function (data) {
    error += data;
  });

  tidy.on('exit', function (code) {
    callback(buffer);
  });

  tidy.stdin.write(html);
  tidy.stdin.end();
}

Pagetty.generateItemSelector = function(html, title, callback) {
  var links = $(html).find("a").get();

  for (var i in links) {
    if ($(links[i]).text().trim() == title) {
      callback(null, this.buildUniqueSelector($(links[i]).parent()));
      return;
    }
  }
  callback("Link not found.");
}

// =============================================================================

/**
 * Find the different segments (types of links).
 */
Pagetty.getProfileSegments = function(url, callback) {
  var profile = {page: null, body: null, links: null, segments: null}, self = this;

  async.series([
    function(next) {
      // Fetch the page.
      self.request({url: url}, function(err, response, buffer, body) {
        if (err) {
          next(err);
        }
        else {
          profile.page = $(body);
          profile.body = body;
          next();
        }
      });
    },
    function(next) {
      // Collect all links from the page.
      self.collectLinks(profile.page, function(err, links) {
        profile.links = links;
        next();
      });
    },
    function(next) {
      // Create segments from the links.
      self.createSegments(profile.links, profile.page, function(segments) {
        profile.segments = segments;
        next();
      });
    },
    function(next) {
      next();
    },
  ], function(err) {
    callback(null, profile.segments);
  });
}

/**
 * Collect all links from the given page.
 */
Pagetty.collectLinks = function(page, callback) {
  var links = page.find("a"), collection = [], i = 0;

  links.each(function(index, el) {
    if (++i >= links.length) {
      callback(null, collection);
    }
    else {
      collection.push($(el));
    }
  });
}

/**
 *
 */
Pagetty.createSegments = function(links, page, callback) {
  var segments = [], paths = [];

  for (var i in links) {
    if (path = this.getPath(links[i])) {
      if (_.indexOf(paths, path) == -1) paths.push(path);
    }
  }

  for (var i in paths) {
    var selector = paths[i];
    var weight = 0;
    var segmentLinks = page.find(paths[i]).toArray();
    var segmentRoot = this.findSegmentRoot(page.find(selector).toArray());
    console.log("segmentroot: " + segmentRoot);
    var la = [];
    var titles = [];
    var combinedTitleLength = 0;
    var onlyNumbers = 0;

    console.log(selector);
    console.log(segmentRoot);
    console.log("---");

    for (var j in segmentLinks) {
      var title = $(segmentLinks[j]).text();
      var href = $(segmentLinks[j]).attr("href");

      if (!title.length) title = $(segmentLinks[j]).attr("title");
      if (title.match(/^\d+$/)) onlyNumbers++;

      if (title.length && href.length) {
        titles.push(title);
        combinedTitleLength += title.length;
        la.push({title: title, href: href});
      }
    }

    // Weight calculation

    var averageTitleLength = (combinedTitleLength / titles.length);

    if (averageTitleLength > 30) {
      weight += 10;
    }
    else if (averageTitleLength > 20) {
      weight += 5;
    }

    if (selector.match(/ h1| h2| h3| h4| article/)) weight += 20;
    if (selector.match(/ h5| h6|\.article|\.title|\.post/)) weight += 10;
    if (selector.match(/footer|comment|thumbnail/)) weight -= 5;


    if (_.uniq(titles).length > 3 && onlyNumbers < 3) {
      segments.push({path: paths[i], segmentRoot: segmentRoot, links: la, weight: weight});
    }
  }

  segments = segments.sort(function(a, b) {
    return parseInt(b.weight) - parseInt(a.weight);
  });

  callback(segments);
}

function xxx(el, ancestor) {
  if (!el.length) {
    return false;
  }
  if (el.parent().html() == ancestor.html()) {
    return el;
  }
  else {
    return xxx(el.parent(), ancestor);
  }
}

Pagetty.findSegmentRoot = function(segment) {
  var elements = [];
  var allClasses = {};
  var usableClasses = [];
  var commonAncestor = this.findCommonAncestor(segment);
  var tagNames = [];

  for (var i in segment) {
    elements.push(xxx($(segment[i]), commonAncestor));
  }

  for (var j in elements) {
    tagNames.push(elements[j].tagName);
    var currentClasses = elements[j].attr("class").split(/[\s\n]+/);

    for (var k in currentClasses) {
      if (!allClasses[currentClasses[k]]) allClasses[currentClasses[k]] = 0;
      if (currentClasses[k]) allClasses[currentClasses[k]]++;
    }
  }

  for (var m in allClasses) {
    if (allClasses[m] == elements.length) usableClasses.push(m);
  }

  if (usableClasses.length) {
    return this.getAbsolutePath(commonAncestor) + " > ." + usableClasses.join(".");
  }
  else {
    var selectors = [];
    tagNames = _.uniq(tagNames);

    for (var i in tagNames) {
      selectors.push(this.getAbsolutePath(commonAncestor) + " > " + tagNames[i]);
    }

    return selectors.join(", ");
  }
}

/**
 *
 */
Pagetty.findCommonAncestor = function(segment) {
  var parents = [];
  var minlen = Infinity;

  $(segment).each(function() {
    var curparents = $(this).parents();
    parents.push(curparents);
    minlen = Math.min(minlen, curparents.length);
  });

  for (var i in parents) {
    parents[i] = parents[i].slice(parents[i].length - minlen);
  }

  // Iterate until equality is found
  for (var i = 0; i < parents[0].length; i++) {
    var equal = true;
    for (var j in parents) {
      if (parents[j][i] != parents[0][i]) {
        equal = false;
        break;
      }
    }
    if (equal) return $(parents[0][i]);
  }
  return $([]);
}



/**
 *
 */
/*
Pagetty.findSegmentRoot = function(testItem, segmentLinks) {
  var matchesFound = 0;
  var pageLinks = testItem.find("a").toArray();

  if (pageLinks.length < segmentLinks.length) {
    this.prevItem = testItem;
    return this.findSegmentRoot(testItem.parent(), segmentLinks);
  }
  else {
    for (var i in segmentLinks) {
      for (var j in pageLinks) {
        if ($(segmentLinks[i]).html() == $(pageLinks[j]).html()) {
          matchesFound++;
          break;
        }
      }
    }

    if (matchesFound == segmentLinks.length) {
      return this.getAbsolutePath(testItem) + " > " + this.findCommonChildSelector(testItem);
    }
    else {
      this.prevItem = testItem;
      return this.findSegmentRoot(testItem.parent(), segmentLinks);
    }
  }
}
*/

Pagetty.findCommonChildSelector = function(el) {
  var selector = null, allClasses = [], items = el.children().toArray();

  for (var i in items) {
    var classes = $(items[i]).attr("class").split(/[\s\n]+/);

    if (!i) {
      allClasses = classes[j];
    }
    else {
      allClasses = _.intersection(allClasses, classes);
    }
  }

  return "." + allClasses.join(".");
}

/**
 * Build a unique CSS selector for a jQuery element.
 * Based on getPath plugin: http://davecardwell.co.uk/javascript/jquery/plugins/jquery-getpath/
 */
Pagetty.getPath = function(el, path) {
  //if (!e.length) return path;

  // The first time this function is called, path won't be defined.
  if (typeof path == 'undefined') path = "";

  // Determine the IDs and path.
  var id = el.attr("id");
  var className = el.attr("class");
  var tagName = el.get(0).tagName.toLowerCase();

  // Add the #id if there is one.
  if (id && !id.match(/\d/)) {
    return "#" + id + (path ? (" > " + path) : "");
  }

  // If this element is <html> we've reached the end of the path.
  if (tagName == "html") return path;

  // Add the element name.
  var cur = tagName;

  // Add any classes that are present.
  var classes = className.split(/[\s\n]+/);
  var filteredClassNames = [];

  for (var i in classes) {
    if (!classes[i].match(/\d/) && classes[i].length) filteredClassNames.push(classes[i]);
  }

  if (filteredClassNames.length == 1) cur += '.' + filteredClassNames.join('.');

  // Recurse up the DOM.
  return this.getPath(el.parent(), cur + (path ? (" > " + path) : ""));
}

/**
 * Build a unique CSS selector for a jQuery element.
 * Based on getPath plugin: http://davecardwell.co.uk/javascript/jquery/plugins/jquery-getpath/
 */
Pagetty.getAbsolutePath = function(el, path) {
  if (!el.length) return path;

  // The first time this function is called, path won't be defined.
  if (typeof path == 'undefined') path = "";

  // Determine the IDs and path.
  var id = el.attr("id");
  var className = el.attr("class");
  var tagName = el.get(0).tagName.toLowerCase();

  // If this element is <html> we've reached the end of the path.
  if (tagName == "html" || tagName == "body") return path;

  // Add the #id if there is one.
  if (id && !id.match(/\d/)) {
    return "#" + id + (path ? (" > " + path) : "");
  }

  // Add the element name.
  var cur = tagName;

  // Add any classes that are present.
  var classes = className.split(/[\s\n]+/);
  var filteredClassNames = [];

  for (var i in classes) {
    if (!classes[i].match(/\d/) && classes[i].length) filteredClassNames.push(classes[i]);
  }

  if (filteredClassNames.length) cur += '.' + filteredClassNames.join('.');

  // Recurse up the DOM.
  return this.getAbsolutePath(el.parent(), cur + (path ? (" > " + path) : ""));
}

// =============================================================================


/**
 * Filter out link texts that probably do not point to stories.
 */
Pagetty.filterLinkTexts = function(text, target) {
  return text;
  // Typical comment link: "(123)".
  if (text.match(/^\(\d+\)$/)) return false;
  // Mo target
  if (target == "") return false;
  // Target is a javascript link
  if (target.match(/^javascript:/)) return false;
  // No target URL on link.
  if (target.match(/^#$/)) return false;

  return text;
}


/**
 * Build a unique CSS selector for a jQuery element.
 * Based on getPath plugin: http://davecardwell.co.uk/javascript/jquery/plugins/jquery-getpath/
 */
Pagetty.buildUniqueSelector = function(el, selector) {
  if (!selector) {
    var selector = [];
  }

  if (!el.get(0)) {
    return selector.join(" ");
  }

  // Determine the IDs and path.
  var id = el.attr("id");
  var className = el.attr("class");
  var currentSelector = el.get(0).tagName.toLowerCase();

  if (currentSelector == "body") {
    return selector.join(" ");
  }

  // Add the #id if there is one.
  if (id && !id.match(/\d/)) {
    currentSelector += "#" + id;
    selector.unshift(currentSelector);
    return selector.join(" ");
  }

  // Add any classes that are present.
  var classes = className.split(/[\s\n]+/);
  var filteredClassNames = [];

  for (var i in classes) {
    if (!classes[i].match(/\d/) && classes[i].length) filteredClassNames.push(classes[i]);
  }

  if (filteredClassNames.length) currentSelector += '.' + filteredClassNames.join(".");

  selector.unshift(currentSelector);
  return this.buildUniqueSelector(el.parent(), selector);
}

/**
 * Extrat the selector data from SoupSelect DOM node for easier processing.
 */
Pagetty.getSelectorData = function(el) {
  var id = el.attr("id");
  var classes = el.attr("class");

  return {
    id: id || false,
    tagName: el.get(0).tagName,
    classes: (classes.length ? classes.split(/\s+/) : [])
  };
}

/**
 * Test if the selector matches only a single result.
 */
Pagetty.selectorIsUnique = function(el, selector) {
  return el.find(selector).length == 1;
}

Pagetty.serializeSelector = function(selectorComponents, additionalElement) {
  var components = _.clone(selectorComponents);

  if (additionalElement) components.push(additionalElement);
  return components.reverse().join(" > ");
}

Pagetty.findItemSelector = function(el, callback) {
  var selector = false;
  var completeSelector = false;
  var itemSelectorComponents = [];

  var selectorData = getSelectorData(el);

  // Create all possible selectors in the form: #ID and TAG.SINGLE_CLASS
  // If such selector matches only one element in the DOM we have found the limiter.

  if (selectorData.id) {
    selector = "#" + selectorData.id;
    completeSelector = this.serializeSelector(itemSelectorComponents, selector);

    console.log("Searching for limiter: " + completeSelector);

    if (this.selectorIsUnique(completeSelector)) {
      itemSelectorComponents.push(selector);
      callback(true);
      return;
    }
  }
  else if (selectorData.classes.length) {
    for (name in selectorData.classes) {
      selector = selectorData.tagName + "." + selectorData.classes[name];
      completeSelector = this.serializeSelector(itemSelectorComponents, selector);

      console.log("Searching for limiter: " + completeSelector);

      if (this.selectorIsUnique(completeSelector)) {
        itemSelectorComponents.push(selector);
        callback(true);
        return;
      }
    }
  }

  selector = selectorData.tagName;
  completeSelector = this.serializeSelector(itemSelectorComponents, selector);
  console.log("Searching for limiter: " + completeSelector);

  if (this.selectorIsUnique(completeSelector)) {
    itemSelectorComponents.push(selector);
    callback(true);
    return;
  }
  else {
    itemSelectorComponents.push(selector);
    this.findItemSelector(el.parent());
  }
}

/**
 * Convert date to a RFC1123 format.
 */
Pagetty.ISODate = function(date) {
  var NUM_TO_MONTH = [
    'Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'
  ];
  var NUM_TO_DAY = [
    'Sun','Mon','Tue','Wed','Thu','Fri','Sat'
  ];
  var d = date.getUTCDate(); d = d > 10 ? d : '0'+d;
  var h = date.getUTCHours(); h = h > 10 ? h : '0'+h;
  var m = date.getUTCMinutes(); m = m > 10 ? m : '0'+m;
  var s = date.getUTCSeconds(); s = s > 10 ? s : '0'+s;
  return NUM_TO_DAY[date.getUTCDay()] + ', ' +
    d+' '+ NUM_TO_MONTH[date.getUTCMonth()] +' '+ date.getUTCFullYear() +' '+
    h+':'+m+':'+s+' GMT';
}

Pagetty.timer = function(start) {
  var end = new Date().getTime();
  return Math.floor(end - start);
}

module.exports = Pagetty;