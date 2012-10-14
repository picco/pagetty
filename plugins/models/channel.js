exports.attach = function(options) {
  var app = this;
  var _ = require('underscore');
  var $ = require('cheerio');
  var async = require('async');
  var mongoose = require('mongoose');
  var parser = require('../../lib/parser.js');
  var profiler = require('../../lib/profiler.js');

  var channelSchema = mongoose.Schema({
    url: {type: String, index: {unique: true}},
    domain: String,
    subscriptions: Number,
    items: Array,
    items_added: Date,
    items_updated: Date,
  });

  /**
   * TODO
   */
  channelSchema.methods.updateSubscriberCount = function(callback) {
    var self = this;
    var query = {};

    query["subscriptions." + this._id] = {$exists: 1};

    app.user.find(query).count(function(err, count) {
      self.subscriptions = count;
      self.save(function(err) {
        callback(err);
      });
    });
  }

  /**
   * Update items.
   */
  channelSchema.methods.updateItems = function(useCache, callback) {
    var self = this;

    async.waterfall([
      function(next) {
        self.fetchItems(useCache, function(err, items) {
          next(err, items);
        });
      },
      function(items, next) {
        self.syncItems(items, function(err) {
          next(err);
        });
      },
      function(next) {
        self.save(function(err) {
          console.log('Updated: ' + self.url + ' items: ' + self.items.length);
          next(err);
        })
      }
    ], function(err) {
      callback(err);
    });
  }

  /**
   * Fetch fresh items for the given channel.
   */
  channelSchema.methods.fetchItems = function(useCache, callback) {
    var self = this;

    async.waterfall([
      function(next) {
        if (useCache) {
          app.fetch({url: self.url}, function(err, buffer) {
            next(err, buffer.toString());
          });
        }
        else {
          app.download({url: self.url}, function(err, buffer) {
            buffer ? next(err, buffer.toString()) : next("Unable to download from: " + self.url);
          });
        }
      },
      function(body, next) {
        app.rule.find({$or: [{url: self.url}, {domain: self.domain}]}, function(err, rules) {
          next(err, body, rules);
        });
      },
      function(body, rules, next) {
        parser.processHTML(self.url, body, rules, function(items) {
          callback(null, items);
          next();
        });
      },
    ], function(err) {
      if (err) callback(err);
    });
  }

  /**
   * Update the existing items with new data while preserving existing item id.
   */
  channelSchema.methods.syncItems = function(new_items, callback) {
    var self = this;
    var counter = 0;
    var synced_items = [];
    var tmp_item;
    var now = new Date();

    if (new_items.length) {
      for (var i in new_items) {
        var exists = false;

        for (var j in this.items) {
          if (this.items[j].target == new_items[i].target) {
            exists = true;
            tmp_item = new_items[i];
            tmp_item.id = this.items[j].id;
            synced_items.push(tmp_item);
            break;
          }
        }

        if (!exists) {
          tmp_item = new_items[i];
          tmp_item.id = app.createObjectID();
          tmp_item.created = null;
          synced_items.push(tmp_item);
        }
      }
    }

    self.items_updated = now;

    if (synced_items.length) {
      _.each(synced_items, function(item, key) {
        if (item.created == null) {
          // This is new item that's not present in current channel items.
          app.history.findOne({"item.target": item.target}, function(err, doc) {
            if (err) throw err;

            if (doc == null) {
              // The item is not found in history, treat as new.
              item.created = now;
              self.items_added = now;
              var historyRecord = new app.history({channel: self._id, item: item});
              historyRecord.save(function(err) {
                if (err) console.log("History write failed: " + err);
              });
            }
            else {
              // The item is present in the history, use the old "created" date.
              item.created = doc.item.created;
              // Client side update's don't know how to update themselves otherwise.
              self.items_added = now;
            }

            if (++counter == synced_items.length) {
              self.items = parser.calculateRelativeScore(synced_items);
              callback();
            }
          });
        }
        else {
          if (++counter == synced_items.length) {
            self.items = parser.calculateRelativeScore(synced_items);
            callback();
          }
        }
      });
    }
    else {
      callback();
    }
  }

  /**
   * Find the different segments (types of links).
   */
  channelSchema.methods.createProfile = function(callback) {
    var self = this;
    var profile = {segments: [], content: {}};

    async.waterfall([
      function(next) {
        app.fetch({url: self.url}, function(err, buffer) {
          err ? next(err) : next(null, $(buffer.toString()));
        });
      },
      function(page, next) {
        profiler.createSegments(self.url, page, function(segments) {
          profile.segments = segments;
          next();
        });
      },
      function(next) {
        self.fetchItems(true, function(err, items) {
          if (err) {
            next(err);
          }
          else {
            for (var i in items) {
              profile.content[items[i].rule] = {itemSelector: null, rule: items[i].rule, links: []};
            }

            for (var i in items) {
              profile.content[items[i].rule].links.push({title: items[i].title, href: items[i].target});
            }

            // Remove those links from segments that are already present in content.

            for (var i in items) {
              for (var j in profile.segments) {
                for (var k in profile.segments[j].links) {
                  if (items[i].target  == profile.segments[j].links[k].href) {
                    profile.segments[j].links.splice(k, 1);
                    if (!profile.segments[j].links.length) profile.segments.splice(j, 1);
                  }
                }
              }
            }

            next();
          }
        });
      },
      function(next) {
        if (_.size(profile.content)) {
          var loopCounter = 0;

          _.each(profile.content, function(el, rule_id) {
            app.rule.findById(rule_id, function(err, rule) {
              if (err) {
                next(err);
              }
              else {
                profile.content[rule_id].itemSelector = rule.item;
              }

              if (++loopCounter >= _.size(profile.content)) next();
            });
          });
        }
        else {
          profile.content = null;
          next();
        }
      }
    ], function(err) {
      if (profile.content) profile.content = _.toArray(profile.content);
      err ? callback(err) : callback(null, profile);
    });
  }

  /**
   * TODO
   */
  channelSchema.statics.updateItemsBatch = function update(forceStart) {
    var self = this;
    var now = new Date().getTime();
    var batchSize = 10; // max number of channels updated during single run.
    var min_interval = 60 * 1000; // Do not start new loop if last update was less than this, in seconds.
    var max_lifetime = 10; // Channel will be updated if time from the last update exceeds this, in minutes.
    var check = new Date(now - (max_lifetime * 60 * 1000));

    if (forceStart || now - app.lastUpdate >= min_interval) {
      console.log('Starting update batch. Last update was ' + parseInt((now - app.lastUpdate) / 1000) + 'sec ago.');

      app.channel.find({subscriptions: {$gt: 0}, $or: [{items_updated: {$exists: false}}, {items_updated: null}, {items_updated: {$lt: check}}]}).sort({items_updated: 1}).limit(batchSize).execFind(function(err, channels) {
        console.log('Expired channels found: ' + (channels ? channels.length : 0));

        _.each(channels, function(channel) {
          channel.updateItems(false, function() {
            app.lastUpdate = new Date().getTime();
          });
        })
      });

    }
    else {
      console.log("Waiting, only " + parseInt((now - app.lastUpdate) / 1000) + "sec has passed from last update...");
    }
  }

  this.channel = app.db.model('Channel', channelSchema, 'channels');
}
