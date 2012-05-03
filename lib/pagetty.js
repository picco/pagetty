var
_          = require('underscore'),
$          = require('jquery'),
check      = require('validator').check,
config     = require('config').server,
cp         = require('child_process'),
crypto     = require('crypto'),
each       = require('each'),
futures    = require('futures'),
im         = require("imagemagick"),
logger     = require(__dirname + "/logger.js");
mongodb    = require('mongodb'),
nodemailer = require("nodemailer"),
parser     = require(__dirname + "/parser.js");
request    = require('request'),
sequence   = futures.sequence(),
URI        = require("uri-js"),
ObjectID   = require('mongodb').ObjectID,
Validator  = require('validator').Validator

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
    callback();
  });
}

/**
 * Load a given user from database.
 */
Pagetty.loadUser = function(id, callback) {
  this.users.findOne({_id: id}, function(err, user) {
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
  this.channels.findOne({_id: new ObjectID(id)}, callback);
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

/**
 * Returns all the subscribed channel id's as an array.
 */
Pagetty.getSubscribedChannels = function(user) {
  var subscriptions = [];

  for (var i in user.subscriptions) {
    subscriptions.push(user.subscriptions[i].channel);
  }

  return subscriptions;
}

/**
 * Load all channels from database.
 */
Pagetty.loadAllChannels = function(callback) {
  this.channels.find().toArray(function(err, result) {
    if (err) {
      logger.log.error(err);
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
Pagetty.updateChannels = function(channel_id, callback) {
  var self = this;
  var max_lifetime = 1; // in minutes.
  var now = new Date();
  var check = new Date(now.getTime() - (max_lifetime * 60000));

  if (channel_id) {
    var query = {_id: channel_id};
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
  });
}

/**
 * Fetch fresh items for the given channel.
 */
Pagetty.fetchChannelItems = function(channel, callback) {
  var self = this;

  this.fetchData({url: channel.url})
    .done(function(err, response, body) {
      if (err) {
        callback(err);
      }
      else {
        self.rules.find({$or: [{url: channel.url}, {domain: channel.domain}]}).toArray(function(err, rules) {
          if (err) throw err;

          var c = cp.fork(__dirname + '/parser_process.js');
          c.send({html: body, channel: channel, rules: rules});
          c.on('message', function(items) {
            callback(false, items);
          });
        });
      }
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
 *
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
 * Update the existing items with new data while preserving existing item id.
 */
Pagetty.syncItems = function(channel, new_items, callback) {
  var items = [], synced_items = [], now = new Date(), new_items_found = false, self = this, counter = 0, tmp_item;

  if (new_items.length) {
    for (var i in new_items) {
      var exists = false;

      for (var j in channel.items) {
        if (channel.items[j].target_url == new_items[i].target_url) {
          exists = true;
          tmp_item = new_items[i];
          tmp_item.id = channel.items[j].id;
          synced_items.push(tmp_item);
          break;
        }
      }

      if (!exists) {
        tmp_item = new_items[i];
        tmp_item.created = null;
        tmp_item.id = self.createObjectID();
        synced_items.push(tmp_item);
      }
    }
  }

  channel.items_updated = now;

  _.each(synced_items, function(item, key) {
    if (item.created == null) {
      self.history.findOne({"item.target_url": item.target_url}, function(err, doc) {
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

Pagetty.fetchData = function(options) {
  return new $.Deferred(function(dfd) {
    options.timeout = 10000;

    if (options.url == null || !options.url.match(/^(http|https):\/\//)) {
      logger.log.warn("Pagetty.fetchData: Invalid URL");
      dfd.resolve("Invalid URL.");
      return;
    }

    request(options, function(err, response, body) {
      logger.log.info("Pagetty.fetchData: Success: " + options.url);
      dfd.resolve(err, response, body);
    });
  }).promise();
}

Pagetty.getSiteInformation = function(url, callback) {
  var info = {url: url, links: {}}, text = '', target = '', path = false, self = this;

  this.fetchData({url: url}).done(function(err, response, body) {
    info.title = $(body).find("title").text();

    var links = $(body).find("a").toArray();

    for (var i in links) {
      text = $(links[i]).text().trim().replace(/\s+/g, " ") || $(links[i]).attr("title").trim();
      path = self.getPath($(links[i]));
      target = $(links[i]).attr("href");
      selected = (path.match(/h1|h2|h3|h4|article/) ? "selected" : "");

      if (text = self.filterLinkTexts(text, target)) {
        if (!info.links[path]) {
          info.links[path] = {text: text + " -- " + target, target: target, path: path, count: 1, selected: selected};
        }
        else {
          info.links[path].count++;
        }
      }
    }

    info.links = _.values(info.links);

    console.dir(info);
    callback(err, info);
  });
}

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
Pagetty.getPath = function(e, path) {
  //if (!e.length) return path;

  // The first time this function is called, path won't be defined.
  if (typeof path == 'undefined') path = "";

  // If this element is <html> we've reached the end of the path.
  if (e.is("html")) return path;

  // Add the element name.
  var cur = e.get(0).nodeName.toLowerCase();

  // Determine the IDs and path.
  var id = e.attr('id');
  var className = e.attr('class');

  // Add the #id if there is one.
  if (id && !id.match(/\d/)) {
    return "#" + id + " > " + cur + (path ? (" > " + path) : "");
  }

  // Add any classes that are present.
  var classes = className.split(/[\s\n]+/);
  var filteredClassNames = [];

  for (var i in classes) {
    if (!classes[i].match(/\d/) && classes[i].length) filteredClassNames.push(classes[i]);
  }

  if (filteredClassNames.length == 1) cur += '.' + filteredClassNames.join('.');

  // Recurse up the DOM.
  return this.getPath(e.parent(), cur + (path ? (" > " + path) : ""));
}

/**
 * Create an unique ObjectID from current timestamp.
 */
Pagetty.createObjectID = function() {
  return new ObjectID(new Date().getTime() / 1000);
}

Pagetty.getCreatedTime = function(now, item, channel) {
  for (var i in channel.items) {
    if (channel.items[i].target_url == item.target_url) {
      return items[i].created ? items[i].created : now;
      break;
    }
  }



  return now;
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
 * Return all channels that match the given URL by domain or exact URL.
 */
Pagetty.findChannelsMatchingURL = function(url, callback) {
  var channels = [], urlComponents = URI.parse(url);

  this.channels.find({url: {$regex: urlComponents.host}}).each(function(err, channel) {
    if (channel) {
      channels.push({_id: channel.id, url: channel.url, name: channel.name, subscriptions: channel.subscriptions});
    }
    else {
      callback(null, channels);
    }
  });
}

/**
 * Return the link data for a given URL.
 */
Pagetty.fetchLinks = function(url, callback) {
  this.fetchData({url: url}).done(function(err, response, body) {
    parser.findLinks(body, function(err, links) {
      console.dir(links);
      callback(links);
    });
  });
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
Pagetty.login = function(name, pass, callback) {
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
  var self = this, channel = false, sequence = futures.sequence();

  sequence.then(function(next) {
    // Check that the channel exists and create it if necessary.
    self.channels.findOne({url: options.url}, function(err, doc) {
      if (doc) {
        channel = doc;
        next();
      }
      else {
        self.channels.insert({url: options.url}, function(err, docs) {
          channel = docs[0];
          next();
        });
      }
    });
  })
  .then(function(next) {
    // Check that the user is not yet subscribed.
    self.users.findOne({_id: options.user_id}, function(err, user) {
      if (err || (user == null)) {
        callback("User not found.");
        return;
      }
      else {
        for (var i in user.subscriptions) {
          console.dir(user.subscriptions[i].channel);
          console.dir(channel._id);
          if (user.subscriptions[i].channel.toString() == channel._id) {
            callback("Already subscribed");
            return;
          }
        }

        next();
      }
    });
  })
  .then(function(next) {
    // Auto-generate a rule if necessary.
    self.createDefaultRule(channel, options.targetSelector, function(err) {
      next();
    })
  })
  .then(function(next) {
    // Update the channel.
    self.updateChannels(channel._id, function() {
      next();
    });
  })
  .then(function(next) {
    // Add channel to user's subscriptions.
    self.users.update({_id: options.user_id}, {'$addToSet': {subscriptions: {channel: channel._id, name: options.name}}}, function(err) {
      err ? callback("Could not add subscription.") : next();
    });
  })
  .then(function(next) {
    // Increment channel's subscribers counter.
    self.channels.update({_id: channel._id}, {'$inc': {subscriptions: 1}}, function(err) {
      err ? callback('Could not increment subscribers.') : callback();
    });
  })
}

Pagetty.createDefaultRule = function(channel, targetSelector, callback) {
  this.createRule({
    url: channel.url,
    target: {selector: targetSelector, url_attribute: "href", title_attribute: false},
    score: {selector: false, url_attribute: false, value_attribute: false},
    image: {selector: "img", url_attribute: "src"}

    }, function(err, rule) {
    callback();
  });
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
              logger.log.error("Cache item not found: " + cache_id);
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
                  logger.log.error("Original unavailable: " + cache_id);
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

module.exports = Pagetty;