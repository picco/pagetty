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
    created: {type: Date, index: true},
    date: {type: Date, index: true},
  });

  /**
   * Get list items.
   */
  itemSchema.statics.getListItems = function(list, user, variant, page, callback) {
    var self = this;
    var query = {};
    var sort = {};
    var items = [];
    var names = {};
    var links = {};

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

      sort = list.type == "all" ? {relative_score: "desc", date: "desc"} : {score: "desc", date: "desc"};

      switch (variant) {
        case "time":
          sort = (list.type == "all") ? {created: "desc", date: "desc", relative_score: "desc"} : {date: "desc", relative_score: "desc"};
          break;
        case "day":
          query.date = {$gte: range.setDate(now.getDate() - 1)};
          break;
        case "week":
          query.date = {$gte: range.setDate(now.getDate() - 7)};
          break;
        case "month":
          query.date = {$gte: range.setDate(now.getDate() - 30)};
          break;
        case "year":
          query.date = {$gte: range.setDate(now.getDate() - 365)};
          break;
      }

      next();

    }, function(next) {
      app.list.find({user_id: user._id}, function(err, lists) {
        async.forEach(lists, function(item, cb) {
          names[item.channel_id] = item.name;
          links[item.channel_id] = item._id;
          cb();
        },
        function() {
          next();
        });
      });
    }, function(next) {
      self.find(query).skip(page * app.conf.load_items).limit(app.conf.load_items).sort(sort).execFind(function(err, results) {
        items = results;
        next();
      });
    }], function(err) {
      async.forEach(items, function(item, cb) {
        item.list_name = names[item.channel_id].substr(0, 22);
        item.list_id = links[item.channel_id];
        item.stamp = item.date.toISOString();
        item.new = item.created > user.low ? "new" : "";
        cb();
      }, function(err) {
        callback(null, items);
      });
    });
  }

  /**
   * Get the new items count for a given user.
   */
  itemSchema.statics.getNewCount = function(user, callback) {
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

  this.item = app.db.model('Item', itemSchema, 'items');
}
