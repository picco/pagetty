exports.attach = function(options) {
  var app = this;
  var _ = require('underscore');
  var async = require('async');
  var mongoose = require('mongoose');

  var itemSchema = mongoose.Schema({
    channel_id: {type: mongoose.Schema.Types.ObjectId, index: true},
    title: String,
    target: {type: String, index: true},
    image: String,
    image_hash: {type: String, index: true},
    comments: String,
    score: Number,
    relative_score: {type: Number, index: true},
    rule: {type: mongoose.Schema.Types.ObjectId, index: true},
    pos: {type: Number, index: true},
    created: {type: Date, index: true},
    date: {type: Date, index: true},
  });

  /**
   * Get the new items count for a given user.
   */
  itemSchema.statics.newCount = function(user, callback) {
    app.list.find({user_id: user._id, type: "channel"}, "channel_id", function(err, channels) {
      if (err) {
        console.log(err);
        callback(0);
      }
      else {
        var query = {channel_id: {$in: _.pluck(channels, "channel_id")}, created: {$gt: user.high}};

        app.item.count(query, function(err, count) {
          if (err) {
            console.log(err);
            callback(0);
          }
          else {
            callback(count);
          }
        });
      }
    });
  }

  /**
   * Get list items.
   */
  itemSchema.statics.getListItems = function(list, user, variant, page, callback) {
    var self = this;
    var query = {};
    var sort = {};
    var items = [];
    var names = {};

    async.series([function(next) {
      if (list.type == "all") {
        app.list.find({user_id: user._id, type: "channel"}, function(err, lists) {
          query = {channel_id: {$in: _.pluck(lists, "channel_id")}, created: {$lte: user.high}};
          async.forEach(lists, function(list, cb) { names[list.channel_id] = list.name; cb(); }, function(err) { next() })
        });
      }
      else {
        query = {channel_id: list.channel_id, created: {$lte: user.high}};
        next();
      }
    }, function(next) {
      var now = new Date();
      var range = new Date();

      switch (variant) {
        case "time":
          sort = {date: 'desc'};
          break;
        case "day":
          sort = {score: 'desc'};
          query.date = {$gte: range.setDate(now.getDate() - 1)};
          break;
        case "week":
          sort = {score: 'desc'};
          query.date = {$gte: range.setDate(now.getDate() - 7)};
          break;
        case "month":
          sort = {score: 'desc'};
          query.date = {$gte: range.setDate(now.getDate() - 30)};
          break;
        case "year":
          sort = {score: 'desc'};
          query.date = {$gte: range.setDate(now.getDate() - 365)};
          break;
        case "all":
          sort = {score: 'desc'};
          break;
      }

      next();

    }, function(next) {
      self.find(query).skip(page * app.conf.load_items).limit(app.conf.load_items).sort(sort).execFind(function(err, results) {
        items = results;
        next();
      });
    }], function(err) {
      async.forEach(items, function(item, cb) {
        app.channel.findById(item.channel_id, function(err, channel) {
          item.channel_url = channel.url;
          item.list_name = list ? "All stories" : list.name;
          item.stamp = item.date.toISOString();
          item.new = item.created > user.low ? "new" : "";
          cb();
        });
      }, function(err) {
        callback(null, items);
      });
    });
  }

  this.item = app.db.model('Item', itemSchema, 'items');
}
