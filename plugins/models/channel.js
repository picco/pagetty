exports.attach = function(options) {
  var app = this;
  var _ = require('underscore');
  var $ = require('cheerio');
  var async = require('async');
  var feedparser = require('feedparser');
  var fs = require('fs');
  var hash = require('mhash').hash;
  var im = require('imagemagick');
  var mongoose = require('mongoose');
  var parser = require('../../lib/parser.js');
  var profiler = require('../../lib/profiler.js');

  var channelSchema = mongoose.Schema({
    type: String,
    url: {type: String, index: {unique: true}},
    domain: String,
    title: String,
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
        self.fetchItems(useCache, function(err, title, items) {
          self.title = title;
          next(err, items);
        });
      },
      /*
      function(items, next) {
        self.fetchSocialData(items, function(items) {
          next(null, items);
        });
      },
      */
      function(items, next) {
        self.syncItems(items, function(err) {
          next(err);
        });
      },
      function(next) {
        self.save(function(err) {
          console.log('Updated: ' + self.url + ' title: ' + self.title + ', items: ' + self.items.length);
          next(err);
        })
      },
      function(next) {
        self.fetchImages(function() {
          next();
        });
      }
    ], function(err) {
      callback(err);
    });
  }

  /**
   * Fetch fresh items for the given channel.
   */
  channelSchema.methods.fetchItems = function(useCache, callback) {
    if (this.type == 'rss') {
      this.fetchRssItems(callback)
    }
    else {
      this.fetchHtmlItems(useCache, callback)
    }
  }

  /**
   * Fetch fresh items for the given channel.
   */
  channelSchema.methods.fetchHtmlItems = function(useCache, callback) {
    var self = this, params = [];

    async.waterfall([
      function(next) {
        app.fetch({url: self.url, evaluateScripts: true, useCache: useCache}, function(err, buffer) {
          buffer ? next(err, buffer.toString()) : next("Unable to download from: " + self.url);
        });
      },
      function(body, next) {
        app.rule.find({$or: [{url: self.url}, {domain: self.domain}]}, function(err, rules) {
          next(err, body, rules);
        });
      },
      function(body, rules, next) {
        parser.processHTML(self.url, body, rules, function(title, items) {
          params.title = title;
          params.items = items;
          next();
        });
      },
    ], function(err) {
      callback(err, params.title, params.items);
    });
  }

  /**
   * Fetch fresh items for the given channel.
   */
  channelSchema.methods.fetchRssItems = function(callback) {
    var self = this;

    feedparser.parseUrl(this.url, function(err, meta, articles) {
      if (err) {
        callback(err);
      } else {
        parser.processRSS(self.url, articles, function(items) {
          callback(null, meta.title, items);
        });
      }
    });
  }

  /**
   * Gather social media data for given items.
   */
  channelSchema.methods.fetchSocialData = function(items, callback) {
    app.forEach(items, function(item, next) {
      app.facebook.likes(item.target, function(count) {
        item.fb_likes = count;
        next();
      });
    }, function() {
      callback(items);
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
            // Preserve id and image_hash values.
            tmp_item.id = this.items[j].id;
            tmp_item.image_hash = this.items[j].image_hash;
            synced_items.push(tmp_item);
            break;
          }
        }

        if (!exists) {
          tmp_item = new_items[i];
          tmp_item.id = app.createObjectID();
          // RSS items have created created value, HTML items don't.
          tmp_item.created = tmp_item.created || null;
          synced_items.push(tmp_item);

          // Client side update's don't know how to update themselves otherwise.
          self.items_added = now;
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
              var historyRecord = new app.history({channel: self._id, item: item});
              historyRecord.save(function(err) {
                if (err) console.log("History write failed: " + err);
              });
            }
            else {
              // The item is present in the history, use the old "created" date.
              item.created = doc.item.created;
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
   * TODO
   */
  channelSchema.methods.fetchImages = function(callback) {
    var self = this;

    async.forEach(this.items, function(item, cb) {
      self.fetchImage(item, function(err) {
        cb();
      });
    }, function(err) {
      self.markModified('items');
      self.save(function(err) {
        callback();
      });
    });
  }

  /**
   * TODO
   */
  channelSchema.methods.fetchImage = function(item, callback) {
    if (item.image) {
      if (item.image_hash == hash('adler32', item.image)) {
        // An up-to-date thumbnail already exists, no need to recreate.
        callback();
        return;
      }
      else {
        item.image_hash = hash('adler32', item.image);

        var cache_id = item.id + '-' + item.image_hash;
        var filename = "./imagecache/" + cache_id + ".jpg";

        app.fetchWithoutCache({url: item.image, evaluateScripts: false}, function(err, buffer) {
          if (err) {
            console.log("Error: Original unavailable: " + item.image + " " + item.id);
            callback("Original unavailable.");
            return;
          }

          fs.writeFile(filename, buffer, function (err) {
            if (err) {
              console.log("Error: Thumbail write failed: " + filename);
              callback("Thumbail write failed.");
              return;
            }

            var convertStart = new Date().getTime();

            im.convert([filename, "-flatten", "-background", "white", "-resize", "538>", "-format", "jpg", filename], function(err, metadata) {
              if (err) {
                fs.unlink(filename);
                console.log("Error: Thumbnail generation failed: " + cache_id + " from: " + url);
                callback("Error generating thumbnail.");
                return;
              }
              else {
                console.log("Image at " + item.image + " conveted in: " + app.timer(convertStart) + "ms");
                callback(null);
                return;
              }
            });
          });
        });
      }
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
        app.fetch({url: self.url, evaluateScripts: true, useCache: true}, function(err, buffer) {
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
        self.fetchItems(true, function(err, title, items) {
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
    var batchSize = app.conf.crawler.batchSize; // max number of channels updated during single run.
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
