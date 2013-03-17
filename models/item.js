exports.attach = function(options) {
  var app = this;
  var $ = require("cheerio");
  var _ = require("underscore");
  var async = require("async");
  var mongoose = require("mongoose");

  var itemSchema = mongoose.Schema({
    channel_id: {type: mongoose.Schema.Types.ObjectId, index: true},
    title: String,
    target: {type: String, index: true},
    image: String,
    image_hash: {type: String, index: true},
    comments: String,
    score: Number,
    relative_score: {type: Number, index: true},
    description: String,
    created: {type: Date, index: true},
    date: {type: Date, index: true},
  });

  /**
   * Get list items.
   */
  itemSchema.statics.getListItems = function(list, user, variant, page, callback) {
    var self = this;
    var query = {};
    var fresh_query = {};
    var sort = {};
    var items = [];

    var from = page * app.conf.load_items;
    var to = (page * app.conf.load_items) + app.conf.load_items - 1;
    var fresh_count = 0;

    async.series([function(next) {
      if (list.type == "all") {
        app.list.find({user_id: user._id, type: "channel"}, function(err, lists) {
          sort = {relative_score: "desc", created: "desc", date: "desc"};
          query = {channel_id: {$in: _.pluck(lists, "channel_id")}, created: {$lte: user.high}};
          fresh_query = {channel_id: {$in: _.pluck(lists, "channel_id")}, $and: [{created: {$lte: user.high}}, {created: {$gt: user.low}}]};
          old_query = {channel_id: {$in: _.pluck(lists, "channel_id")}, created: {$lte: user.low}};
          next();
        });
      }
      else if (list.type == "directory") {
        app.list.find({user_id: user._id, type: "channel", directory_id: list._id}, function(err, lists) {
          sort = {relative_score: "desc", created: "desc", date: "desc"};
          query = {channel_id: {$in: _.pluck(lists, "channel_id")}, created: {$lte: user.high}};
          fresh_query = {channel_id: {$in: _.pluck(lists, "channel_id")}, $and: [{created: {$lte: user.high}}, {created: {$gt: user.low}}]};
          old_query = {channel_id: {$in: _.pluck(lists, "channel_id")}, created: {$lte: user.low}};
          next();
        });
      }
      else if (list.type == "search") {
        app.list.find({user_id: user._id, type: "channel"}, function(err, lists) {
          sort = {created: "desc", date: "desc", relative_score: "desc"};
          query = {channel_id: {$in: _.pluck(lists, "channel_id")}, created: {$lte: user.high}, title: {$regex: (".*" + variant + ".*"), $options: "i"}};
          fresh_query = {channel_id: {$in: _.pluck(lists, "channel_id")}, $and: [{created: {$lte: user.high}}, {created: {$gt: user.low}}], title: {$regex: (".*" + variant + ".*"), $options: "i"}};
          old_query = {channel_id: {$in: _.pluck(lists, "channel_id")}, created: {$lte: user.low}, title: {$regex: (".*" + variant + ".*"), $options: "i"}};
          next();
        });
      }
      else {
        sort = {score: "desc", created: "desc", date: "desc"};
        query = {channel_id: list.channel_id, created: {$lte: user.high}};
        fresh_query = {channel_id: list.channel_id, $and: [{created: {$lte: user.high}}, {created: {$gt: user.low}}]};
        old_query = {channel_id: list.channel_id, $and: [{created: {$lte: user.high}}, {created: {$lte: user.low}}]};
        next();
      }
    }, function(next) {
      if (list.type != "search") {
        var now = new Date();
        var range = new Date();

        switch (variant) {
          case "day":
            query.date = fresh_query.date = old_query.date = {$gte: range.setDate(now.getDate() - 1)};
            break;
          case "week":
            query.date = fresh_query.date = old_query.date = {$gte: range.setDate(now.getDate() - 7)};
            break;
          case "month":
            query.date = fresh_query.date = old_query.date = {$gte: range.setDate(now.getDate() - 30)};
            break;
          case "year":
            query.date = fresh_query.date = old_query.date = {$gte: range.setDate(now.getDate() - 365)};
            break;
        }
      }

      next();

    }, function(next) {
      if (variant == "time") {
        async.series([function(next2) {
          self.count(fresh_query, function(err, count) {
            fresh_count = count;
            next2(err);
          });
        }, function(next2) {
          // Query all results from fresh items.
          if (fresh_count && from < fresh_count) {
            self.find(fresh_query).skip(from).limit(app.conf.load_items).sort({relative_score: "desc", created: "desc", date: "desc"}).execFind(function(err, results) {
              items = results;
              next2();
            });
          }
          else {
            next2();
          }
        }, function(next2) {
          // Query all results from the old items.
          if (items.length < app.conf.load_items) {
            var old_from = Math.max(0, from - items.length);

            self.find(old_query).skip(old_from).limit(app.conf.load_items - items.length).sort({created: "desc", date: "desc", relative_score: "desc"}).execFind(function(err, results) {
              for (var i in results) {
                items.push(results[i]);
              }
              next2();
            });
          }
          else {
            next2();
          }
        }], function(err) {
          next();
        });
      }
      else {
        // Query all results with a single query when possible.
        self.find(query).skip(page * app.conf.load_items).limit(app.conf.load_items).sort(sort).execFind(function(err, results) {
          items = results;
          next();
        });
      }
    }], function(err) {
      self.prepare(items, user, function(items) {
        callback(null, items);
      });
    });
  }

  /**
   * Prepare items for rendering.
   */
  itemSchema.statics.prepare = function(items, user, callback) {
    var self = this;
    var names = {};
    var links = {};

    async.series([
      function(next) {
        app.list.find({user_id: user._id, type: "channel"}, function(err, lists) {
          async.forEach(lists, function(list, cb) {
            names[list.channel_id] = list.name;
            links[list.channel_id] = list._id;
            cb();
          },
          function() {
            next();
          });
        });
      }, function(next) {
        async.forEach(items, function(item, cb) {
          item.description = self.sanitizeDescription(item.description);
          item.list_name = names[item.channel_id].substr(0, 22);
          item.list_id = links[item.channel_id];
          item.stamp = item.date.toISOString();
          item.stamp_unix = item.date.getTime();
          item.new = item.created > user.low ? "new" : "";
          cb();
        }, function(err) {
          next();
        });
      }
    ], function(err) {
      callback(items);
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

  /**
   * Get the new items count for a given user.
   */
  itemSchema.statics.sanitizeDescription = function(str) {
    var description = new String(str);

    description = description.replace(/<p>&nbsp;<\/p>/gi, "");
    description = description.replace(/(<br\s*\/?>\s*)+/gi, "<br/>");
    description = app.item.sanitizeHTML(description, {
      "a": ["href"],
      "b": ["style"],
      "blockquote": [],
      "br": [],
      "center": [],
      "code": [],
      "div": [],
      "em": ["style"],
      "font": [],
      "h1": [],
      "h2": [],
      "h3": [],
      "h4": [],
      "h5": [],
      "h6": [],
      "hr": [],
      "i": [],
      "img": ["src", "align"],
      "li": [],
      "ol": [],
      "p": [],
      "pre": [],
      "small": [],
      "span": [],
      "strike": [],
      "strong": ["style"],
      "sub": [],
      "sup": [],
      "table": [],
      "thead": [],
      "tbody": [],
      "tr": [],
      "td": [],
      "th": [],
      "u": [],
      "ul": [],
    });

    return description;
  }

  /**
   * Sanitize HTML tags and attributes based on a provided whitelist.
   */
  itemSchema.statics.sanitizeHTML = function(html, whitelist) {
    var els = $('<div>'+ html +'</div>');

    $(els).find('a[href*="feeds.feedburner.com"], img[src*="feeds.feedburner.com"]').remove();

    $(els).find("*").each(function() {
      var name = this[0].name.toLowerCase();
      var allowed_attrs = whitelist[name];

      if (_.isArray(allowed_attrs)) {
        var attribs = _.keys(this[0].attribs);

        for (var i = 0; i < _.size(attribs); i++) {
          if (_.indexOf(allowed_attrs, attribs[i]) == -1) {
            $(this).removeAttr(attribs[i])
          }
        }

        if (name == "a") $(this).attr("target", "_blank");
      }
      else {
        $(this).remove();
      }
    });

    return $(els).html();
  }

  this.item = app.db.model('Item', itemSchema, 'items');
}
