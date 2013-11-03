exports.attach = function(options) {
  var app = this;
  var $ = require("cheerio");
  var _ = require("underscore");
  var async = require("async");
  var es = require("es")({_index: 'main', _type : 'item'});  
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
   * Index the item to ElasticSearch after saving.
   */
  itemSchema.post('save', function(item) {
    es.index({_id: item._id}, {title: item.title, description: item.description}, function(err, data) {});    
  });  
  
  /**s
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
        es.search({query: {query_string: {query: variant}}, from: 0, size: 100}, function(err, data) {
          if (err) {
            next();
          }
          else {
            var ids = _.pluck(data.hits.hits, "_id");
           
            app.list.find({user_id: user._id, type: "channel"}, function(err, lists) {           
              sort = {created: "desc", date: "desc", relative_score: "desc"};
              query = {channel_id: {$in: _.pluck(lists, "channel_id")}, created: {$lte: user.high}, _id: {$in: ids}};
              fresh_query = {channel_id: {$in: _.pluck(lists, "channel_id")}, $and: [{created: {$lte: user.high}}, {created: {$gt: user.low}}], _id: {$in: ids}};
              old_query = {channel_id: {$in: _.pluck(lists, "channel_id")}, created: {$lte: user.low}, _id: {$in: ids}};
              next();
            });
          }
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
      self.prepare(items, user, function(items_prepared) {
        callback(null, items_prepared);
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
    var ids = {};
    var prepared = [];

    async.series([
      function(next) {
        app.list.find({user_id: user._id, type: "channel"}, function(err, lists) {
          async.forEach(lists, function(list, cb) {
            names[list.channel_id] = list.name;
            links[list.channel_id] = list.link;
            ids[list.channel_id] = list._id;
            cb();
          },
          function() {
            next();
          });
        });
      }, function(next) {
        async.each(items, function(item, cb) {
          var p_item = item.toJSON();
         
          p_item.description = self.sanitizeDescription(item);
          p_item.list_name = names[item.channel_id];
          p_item.list_link = links[item.channel_id];
          p_item.list_id = ids[item.channel_id];
          p_item.stamp = item.date.toISOString();
          p_item.stamp_unix = item.date.getTime();
          p_item.new = item.created > user.low ? "new" : "";
          prepared.push(p_item);
          cb();
        }, function(err) {
          next();
        });
      }
    ], function(err) {
      callback(prepared);
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
  itemSchema.statics.sanitizeDescription = function(item) {
    var description = new String(item.description || "");

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

    // Add image to the description when appropriate.

    if (item.image && !$('<div>' + description + '</div>').find("img").length) {
      description = '<img class="lazy" data-original="' + item.image + '" src="/images/empty.gif" alt="" />' + description;
    }
    else {
      var links = $(description).find("a").toArray();

      for (var i = 0; i < links.length; i++) {
        if ($(links[i]).html() == "[link]") {
          var href = app.parser.checkImageURL($(links[i]).attr("href"));
          if (href) description = '<img class="lazy" data-original="' +  href + '" src="/images/empty.gif" alt="" />' + description;
          break;
        }
      }
    }

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
        if (name == "img") {
          $(this).data("original", $(this).attr("src")).attr("src", "/images/empty.gif").addClass("lazy");
        }
      }
      else {
        $(this).remove();
      }
    });

    return $(els).html();
  }

  this.item = app.db.model('Item', itemSchema, 'items');
}
