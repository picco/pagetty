var
  _ = require('underscore'),
  $ = require('jquery'),
  each = require('each'),
  request = require('request'),
  futures = require('futures'),
  mongodb = require('mongodb'),
  mongoose = require('mongoose'),
  sequence = futures.sequence(),
  Validator = require('validator').Validator,
  check = require('validator').check,
  ObjectID = require('mongodb').ObjectID,
  db_connection = false,
  db = false,
  db_channels = false,
  db_users = false,
  pagetty = {};

/**
 * Configuration & setup.
 */

Validator.prototype.error = function (msg) {
  this._errors.push(msg);
}

Validator.prototype.hasErrors = function () {
  return this._errors.length;
}

Validator.prototype.getErrors = function () {
  return this._errors;
}

/**
 * Pagetty
 */
pagetty.init = function(config, callback) {
  mongoose.connect(config.db_url);

  db_connection = new mongodb.Db('pagetty', new mongodb.Server(config.db_host, config.db_port)),
  db_connection.open(function(error, client) {
    if (error) {
      console.log(error);
      process.exit();
    }
    else {
      db = client;
      db_channels = new mongodb.Collection(db, 'channels');
      db_users = new mongodb.Collection(db, 'users');
      callback();
    }
  });
}

pagetty.loadUser = function(uid, callback) {
  db.collection('users', function(err, collection) {
    if (err) {
      console.log(err);
      process.exit();
    }
    else {
      res = collection.find({_id: uid}).nextObject(function(err, user) {
        if (err) {
          console.log(err);
          process.exit();
        }
        else {
          callback(user);
        }
      });
    }
  });
}

pagetty.loadUserChannels = function(user, callback) {
  var channels = {};

  db.collection('channels', function(err, collection) {
    collection.find({_id: {$in: user.subscriptions}}).toArray(function(err, result) {
      for (i in result) {
        channels[result[i]._id] = result[i];
      }
      callback(channels);
    });
  });
}

pagetty.loadAllChannels = function(callback) {
  db_channels.find().toArray(function(err, result) {
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

pagetty.loadChannelForUpdate = function(callback) {
  var max_lifetime = 600;
  var now = new Date().getTime();

  db.collection('channels', function(err, collection) {
    collection.find({items_updated: {$lt: now - (max_lifetime * 1000)}}).sort({items_updated: 1}).limit(1).nextObject(function(err, result) {
      if (err) {
        console.log(err);
        process.exit();
      }
      else {
        callback(result);
      }
    });
  });
}

pagetty.loadUserChannelUpdates = function(user, state, callback) {
  var updates = {};
  var channels = [];

  for (var i in state.channels) {
    channels.push(i);
  }

  db_channels.find({_id: {$in: channels}}).toArray(function(err, results) {
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
pagetty.updateChannelItems = function(channel, callback) {
  pagetty.fetchChannelItems(chennel, function(err, updated_channel) {
    if (err) {
      console.log(err);
      callback();
    }
    else {
      db_channels.update({_id: updated_channel._id}, updated_channel, {}, function(err) {
        if (err) {
          console.log(err);
        }
        callback();
      });
    }
  })
}

pagetty.loadChannel = function(id, callback) {
  db_channels.findOne({_id: new ObjectID(id)}, callback);
}

pagetty.createChannel = function(channel, callback) {
  db_channels.insert(channel, {safe: true}, function(err, doc) {
    if (err) {
      console.log(err);
      callback(err);
    }
    else {
      callback(false, doc[0]);
    }
  });
}


pagetty.updateChannel = function(channel, callback) {
  var id = new ObjectID(channel._id);
  delete channel._id;

  db_channels.update({_id: id}, channel, {safe: true}, function(err) {
    if (err) {
      console.log(err);
      callback(err);
    }
    else {
      callback();
    }
  });
}

/**
 * Fetch fresh items for the given channel.
 */
pagetty.fetchChannelItems = function(channel, callback) {
  var now = new Date().getTime();

  pagetty.fetchData(channel.uri)
    .done(function(response, err) {
      if (err) {
        callback(err);
      }
      else {
        var items = pagetty.processData(response, channel);

        if (items.length) {
          channel.items_updated = now;
          channel.items_added = pagetty.compareItems(channel.items, items) ? channel.items_added : now;
          channel.items = items;
          callback(false, channel);
        }
        else {
          callback('No items found.');
        }
      }
    });
}

pagetty.compareItems = function(previous, current) {
  for (var i in current) {
    var exists = false;
    for (var j in previous) {
      if (previous[j].target_uri == current[i].target_uri) {
        exists = true;
        break;
      }
    }
    if (!exists) return false;
  }
  return true;
}

pagetty.fetchData = function(uri) {
  return new $.Deferred(function(dfd) {
    request({uri: uri, timeout: 10000}, function(err, response, body) {
      dfd.resolve(body, err);
    });
  }).promise();
}

pagetty.processData = function(response, channel) {
  var items = [];
  var now = new Date().getTime();

  for (i in channel.components) {
    var elements = $(response).find(channel.components[i].item).get();

    for (j in elements) {
      var item = pagetty.processItem(elements[j], channel, channel.components[i]);

      item.created = pagetty.getCreatedTime(now, item, channel.items);
      if (item.title && item.target_uri && pagetty.itemIsUnique(item, items)) {
        items.push(item);
      }
    }
  }

  return items;
}

pagetty.getCreatedTime = function(now, item, items) {
  for (var i in items) {
    if (items[i].target_uri == item.target_uri) {
      return items[i].created ? items[i].created : now;
      break;
    }
  }
  return now;
}

/**
 * Chech that the item's target URL is not present already.
 */
pagetty.itemIsUnique = function(item, items) {
  for (var i in items) {
    if (items[i].target_uri == item.target_uri) {
      return false;
    }
  }
  return true;
}

pagetty.processItem = function(item_data, channel, component) {
  var item = {
    title: pagetty.processElement(item_data, component.title_selector, component.title_attribute),
    target_uri: pagetty.processURI(pagetty.processElement(item_data, component.target_selector, component.target_attribute), channel),
    image_uri: pagetty.processURI(pagetty.processElement(item_data, component.image_selector, component.image_attribute), channel),
    score: pagetty.processScore(pagetty.processElement(item_data, component.score_selector, component.score_attribute))
  }

  if (item.target_uri && item.target_uri.match(/\.(jpg|png|gif)$/gi)) item.image_uri = item.target_uri;
  return item;
}

pagetty.processElement = function(data, selector, attribute) {
  if (typeof(selector) == 'undefined') {
    return null;
  }
  else if (attribute) {
    return pagetty.stripTags($(data).find(selector).attr(attribute));
  }
  else {
    return pagetty.stripTags($(data).find(selector).html());
  }
}

pagetty.processURI = function(uri, channel) {
  if (uri != null && uri.match(/^(\/\/).+/)) {
    return 'http://' + uri.replace(/^\/\//, '');
  }
  else if (uri != null && !uri.match(/^(http:|https:).+/)) {
    return (typeof(channel.base_uri) == 'undefined' ? channel.uri : (channel.base_uri) + '/' + uri.replace(/^\//, ''));
  }
  else {
    return uri;
  }
}

pagetty.processScore = function(string) {
  if (string) {
    return string.replace(/[^0-9.]/g, '');
  }
  else {
    return null;
  }
}

pagetty.stripTags = function(string) {
  if (string) {
    return string.replace(/<\/?(?!\!)[^>]*>/gi, '');
  }
  else {
    return null;
  }
}

pagetty.validateChannel = function(channel) {
  var validator = new Validator;

  validator.check(channel.name, 'Name must start with a character.').is(/\w+.*/);
  validator.check(channel.uri, 'URL is not valid.').is(/(http|https):\/\/.+\..+/);

  _.each(channel.components, function(component) {
    validator.check(component.item, 'Item selector is always required.').notEmpty();
    validator.check(component.title_selector, 'Title selector is always required.').notEmpty();
    validator.check(component.target_selector, 'Target selector is always required.').notEmpty();
  });

  if (validator.hasErrors()) {
    return validator.getErrors();
  }
  else {
    return [];
  }
}

module.exports = pagetty;