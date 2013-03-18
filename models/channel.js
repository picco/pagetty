exports.attach = function(options) {
  var app = this;
  var async = require('async');
  var feedparser = require('feedparser');
  var hash = require('mhash').hash;
  var mongoose = require('mongoose');

  var channelSchema = mongoose.Schema({
    type: String,
    url: {type: String, index: {unique: true}},
    domain: String,
    link: String,
    title: String,
    subscriptions: Number,
    items_added: Date,
    items_updated: Date,
  });

  /**
   * Crawl the site and update stories.
   */
  channelSchema.methods.crawl = function(callback) {
    var self = this;
    var date = new Date();

    self.fetchItems(date, function(err, title, items) {
      self.syncItems(date, items, function(err) {
        app.log("crawl", "updated", self.url, "items:", items.length);

        if (err) {
          callback();
        }
        else {
          self.recalculateRelativeScores(function(err) {
            callback();
          });
        }
      });
    });
  }

  /**
   * Find all feeds that need to be update and crawl through them.
   */
  channelSchema.statics.crawlBatch = function update(done) {
    var self = this;
    var now = new Date().getTime();
    var batch_size = app.conf.crawler.batchSize;
    var channel_lifetime = app.conf.crawler.channelLifetime;
    var check = new Date(now - (channel_lifetime * 60 * 1000));
    var updated_channels = 0;

    app.log("crawlBatch", "starting new batch");

    app.channel.find({subscriptions: {$gt: 0}, $or: [{items_updated: {$exists: false}}, {items_updated: null}, {items_updated: {$lt: check}}]}).sort({items_updated: 1}).limit(batch_size).execFind(function(err, channels) {
      async.mapSeries(channels, function(channel, next) {
        channel.crawl(function() {
          updated_channels++;
          next();
        });
      }, function(err) {
        app.log("crawlBatch", "batch completed", "updated channels:", updated_channels);
        done(updated_channels);
      });
    });
  }

  /**
   * Fetch fresh items for the given channel.
   */
  channelSchema.methods.fetchItems = function(date, callback) {
    this.type == 'rss' ? this.fetchRssItems(date, callback) : this.fetchHtmlItems(date, callback);
  }

  /**
   * Fetch fresh items for the given channel.
   */
  channelSchema.methods.fetchHtmlItems = function(date, callback) {
    var self = this, params = [];

    async.waterfall([
      function(next) {
        app.fetch({url: self.url}, function(err, buffer) {
          buffer ? next(err, app.bufferToString(buffer)) : next("Unable to download from: " + self.url);
        });
      },
      function(body, next) {
        app.rule.find({$or: [{url: self.url}, {domain: self.domain}]}, function(err, rules) {
          next(err, body, rules);
        });
      },
      function(body, rules, next) {
        app.parser.processHTML(date, self, body, rules, function(title, items) {
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
  channelSchema.methods.fetchRssItems = function(date, callback) {
    var self = this;

    app.fetch({url: this.url}, function(err, buffer) {
      if (err) {
        callback(err);
      }
      else {
        feedparser.parseString(app.bufferToString(buffer), function(err, meta, articles) {
          if (err) {
            callback(err);
          } else {
            app.rule.findOne({type: "rss", domain: self.domain}, function(err, rule) {
              app.parser.processRSS(date, self.url, articles, rule, function(items) {
                callback(null, meta.title, items);
              });
            });
          }
        });
      }
    });
  }

  /**
   * Sync old and new data for given items.
   */
  channelSchema.methods.syncItems = function(date, items, callback) {
    var self = this;

    function update() {
      // Update the items_updated attribute.
      self.items_updated = date;

      // Save the items_added, items_updated attributes.
      self.save(function(err) {
        if (err) app.err("syncItems", err);
        callback();
      });
    }

    if (items && items.length) {
      async.forEach(items, function(item, callback) { self.syncItem.call(self, item, callback) }, function(err) {
        if (err) app.err("syncItems", err);
        update();
      });
    }
    else {
      update();
    }
  }

  /**
   * Sync a single channel item data.
   */
  channelSchema.methods.syncItem = function(new_item, callback) {
    var self = this;

    app.item.findOne({channel_id: this._id, target: new_item.target}, function(err, current_item) {
      if (err) {
        app.err("syncItem", "find item query failed");
      }
      else if (current_item) {
        current_item.title = new_item.title;
        current_item.target = new_item.target;
        current_item.image = new_item.image;
        current_item.image_hash = new_item.image ? hash('adler32', new_item.image) : null;
        current_item.comments = new_item.comments;
        current_item.score = new_item.score;
        current_item.relative_score = new_item.relative_score;

        current_item.save(function(err) {
          if (err) app.err("syncItem", err);
          callback();
        });
      }
      else {
        // Add additional data before saving.
        new_item.channel_id = self._id;
        new_item.image_hash = new_item.image ? hash('adler32', new_item.image) : null;

        app.item.create(new_item, function(err) {
          if (err) app.err("syncItem", err);

          // When adding new items, the created stamp of this batch needs to be assigned to items_added attribute of the channel.
          self.items_added = new_item.created;

          callback();
        });
      }
    });
  }

  /**
   * Update the subscriber count of the channel.
   */
  channelSchema.methods.updateSubscriberCount = function(callback) {
    var self = this;

    app.list.count({type: "channel", channel_id: this._id}, function(err, count) {
      if (err) {
        app.err("updateSubscriberCount", err);
        callback(err);
      }
      else {
        self.subscriptions = count;
        self.save(function(err) {
          callback(err);
        });
      }
    });
  }

  /**
   * Recalculate relative scores for all items.
   */
  channelSchema.methods.recalculateRelativeScores = function(callback) {
    var self = this;
    var min = 0;
    var max = 0;
    var rel = 0;

    async.waterfall([
      // Find max score
      function(next) {
        app.item.find({channel_id: self._id}).sort({score: -1}).limit(1).execFind(function(err, items) {
          max = items[0] ? parseFloat(items[0].score) : 0;
          next();
        });
      },
      // Recalculate scores
      function(next) {
        app.item.find({channel_id: self._id}, function(err, items) {
          async.forEach(items, function(item, cb) {
            rel = new Number((item.score - min) / (max - min)).toPrecision(4);
            item.relative_score = (rel == "NaN" || rel == "Infinity") ? 0 : rel;
            item.save(function(err) {
              if (err) app.err("recalculateRelativeScores", err);
              cb();
            });
          }, function() {
            next();
          });
        });
      },
    ], function(err) {
      callback();
    });
  }

  this.channel = app.db.model('Channel', channelSchema, 'channels');
}
