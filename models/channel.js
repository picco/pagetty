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

  var channelSchema = mongoose.Schema({
    type: String,
    url: {type: String, index: {unique: true}},
    domain: String,
    title: String,
    subscriptions: Number,
    items_added: Date,
    items_updated: Date,
  });

  /**
   * Update the subscriber count of the channel.
   */
  channelSchema.methods.updateSubscriberCount = function(callback) {
    var self = this;

    app.list.count({type: "channel", channel_id: this._id}, function(err, count) {
      if (err) {
        console.log(err);
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
   * Update items.
   */
  channelSchema.methods.updateItems = function(callback) {
    var self = this;
    var date = new Date();

    async.waterfall([
      function(next) {
        self.fetchItems(date, function(err, title, items) {
          self.title = title;
          next(err, items);
        });
      },
      function(items, next) {
        self.syncItems(date, items, function(err) {
          console.log('Updated: ' + self.url + ' title: ' + self.title + ', items: ' + items.length);
          next(err);
        });
      },
    ], function(err) {
      callback(err);
    });
  }

  /**
   * Fetch fresh items for the given channel.
   */
  channelSchema.methods.fetchItems = function(date, callback) {
    if (this.type == 'rss') {
      this.fetchRssItems(date, callback)
    }
    else {
      this.fetchHtmlItems(date, callback)
    }
  }

  /**
   * Fetch fresh items for the given channel.
   */
  channelSchema.methods.fetchHtmlItems = function(date, callback) {
    var self = this, params = [];

    async.waterfall([
      function(next) {
        app.fetch({url: self.url}, function(err, buffer) {
          buffer ? next(err, buffer.toString()) : next("Unable to download from: " + self.url);
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

    feedparser.parseUrl(this.url, function(err, meta, articles) {
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

  /**
   * Update all items for a given channel.
   */
  channelSchema.methods.syncItems = function(date, items, callback) {
    var self = this;

    // Set the pos attribute to zero so that we can identify current items.
    // The pos attribute will be reset for each
    app.item.update({chanel_id: self._id}, {$set: {pos: 0}}, function(err) {
      if (err) console.log(err);

      async.forEach(items, function(item, callback) { self.syncItem.call(self, item, callback) }, function(err) {
        if (err) console.log(err);

        // Update the items_updated attribute.
        self.items_updated = date;

        // Save the items_added, items_updated attributes.
        self.save(function(err) {
          if (err) console.log(err);
          callback();
        });
      });
    });
  }

  /**
   * Sync a single channel item data.
   */
  channelSchema.methods.syncItem = function(new_item, callback) {
    var self = this;

    app.item.findOne({channel_id: this._id, target: new_item.target}, function(err, current_item) {
      if (err) {
        console.log('Error: syncItem() find item query failed.');
      }
      else if (current_item) {
        current_item.title = new_item.title;
        current_item.target = new_item.target;
        current_item.image = new_item.image;
        current_item.image_hash = new_item.image ? hash('adler32', new_item.image) : null;
        current_item.comments = new_item.comments;
        current_item.score = new_item.score;
        current_item.relative_score = new_item.relative_score;
        current_item.rule = new_item.rule;
        current_item.pos = new_item.pos;

        current_item.save(function(err) {
          if (err) console.log(err);
          callback();
        });
      }
      else {
        // Add additional data before saving.
        new_item.channel_id = self._id;
        new_item.image_hash = new_item.image ? hash('adler32', new_item.image) : null;

        app.item.create(new_item, function(err) {
          if (err) console.log(err);

          // When adding new items, the created stamp of this batch needs to be assigned to items_added attribute of the channel.
          self.items_added = new_item.created;

          callback();
        });
      }
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
