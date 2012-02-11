var
  $ = require('jquery'),
  each = require('each'),
  request = require('request'),
  futures = require('futures'),
  mongodb = require('mongodb'),
  sequence = futures.sequence(),
  db_connection = false,
  db = false;
  db_channels = false;
  db_users = false;
  pagetty = {};

pagetty.init = function(config, callback) {
  console.dir(config);
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
/*
      db_connection.authenticate('pagetty_dev', 'savisaar', function(err) {
        if (err) {
          console.log(err);
          process.exit();
        }
        else {
          console.log('Database authentication successful.');
          callback();
        }
      });
*/
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

/*
  each(state.channels)
    .on('item', function(next, id, timestamp) {
      console.log(timestamp);

    })
    .on('end', function() {
      console.log(updates);
      callback(updates);
    });
*/
}

pagetty.updateChannel = function(channel, callback) {
  var now = new Date().getTime();

  pagetty.fetchData(channel.uri)
    .done(function(response, err) {
      if (err) {
        console.log('Failed to request: ' + channel.uri);
        callback();
      }
      else {
        console.log('Data bytes received: ' + response.length);
        var items = pagetty.processData(response, channel);

        if (items.length) {
          channel.items_updated = now;
          channel.items_added = pagetty.compareItems(channel.items, items) ? channel.items_added : now;
          channel.items = items;
          db_channels.update({_id: channel._id}, channel, {}, function(err) {
            if (err) {
              console.log(err);
              process.exit();
            }
            callback();
          });
        }
        else {
          console.log('No items found.');
          callback();
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
    title: pagetty.processElement(component.title, item_data),
    target_uri: pagetty.processURI(pagetty.processElement(component.target, item_data), channel),
    image_uri: pagetty.processURI(pagetty.processElement(component.image, item_data), channel),
    score: pagetty.processScore(pagetty.processElement(component.score, item_data))
  }

  if (item.target_uri && item.target_uri.match(/\.(jpg|png|gif)$/gi)) item.image_uri = item.target_uri;
  return item;
}

pagetty.processElement = function(def, data) {
  if (typeof(def) == 'undefined') {
    return null;
  }
  else if (def.attribute) {
    return pagetty.stripTags($(data).find(def.selector).attr(def.attribute));
  }
  else {
    return pagetty.stripTags($(data).find(def.selector).html());
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

module.exports = pagetty;