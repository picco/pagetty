exports.attach = function(options) {
  var app = this;
  var async = require("async");
  var mongoose = require("mongoose");

  var listSchema = mongoose.Schema({
    user_id: {type: mongoose.Schema.Types.ObjectId, index: true},
    channel_id: {type: mongoose.Schema.Types.ObjectId, index: true},
    directory_id: {type: mongoose.Schema.Types.ObjectId, index: true},
    type: {type: String, index: true},
    name: String,
    domain: String,
    link: String,
    weight: Number,
  });

  /**
   * Validate the entity before saving.
   */
  listSchema.pre("save", function(next) {
    var validator = app.getValidator();
    validator.check(this.name, "Name must be specified.").len(3);
    validator.hasErrors() ? next(new Error(validator.getErrors()[0])) : next();
  });

  /**
   * When a directory is removed, move all lists it contains to the root level.
   */
  listSchema.post("remove", function(list) {
    if (list.type == "directory") {
      app.list.find({directory_id: list._id}, function(err, lists) {
        if (lists) {
          lists.forEach(function(item) {
            item.directory_id = undefined;
            item.save(function(err) {
              // noop.
            });
          });
        }
      });
    }
  });

  /**
   * Generate the special "all" list definition.
   */
  listSchema.statics.all = function() {
    return {_id: "all", type: "all", name: "All articles", icon: 'https://s2.googleusercontent.com/s2/favicons?domain=pagetty.com'};
  }

  /**
   * Create a subscription list.
   */
  listSchema.statics.createFromChannel = function(user_id, channel, name, directory_name, callback) {
    var list = {user_id: user_id, channel_id: channel._id, type: "channel", domain: channel.domain, link: channel.link, name: name, weight: 0};

    async.series([
      function(next) {
        if (directory_name) {
          app.list.findOne({user_id: user_id, type: "directory", name: directory_name}, function(err, doc) {
            if (err) app.err("createFromChannel", err);

            if (doc) {
              list.directory_id = doc._id;
              next();
            }
            else {
              app.list.create({type: "directory", user_id: user_id, name: directory_name}, function(err, doc) {
                if (err) app.err("createFromChannel", err);
                if (doc) list.directory_id = doc._id;
                next();
              });
            }
          });
        }
        else {
          next();
        }
      },
      function(next) {
        app.list.create(list, function(err, list) {
          if (err) app.err("createFromChannel", err);
          callback(err, list);
          next();
        });
      }
    ]);
  }

  listSchema.statics.getById = function(list_id, variant, callback) {
    if (list_id == "all") {
      callback(null, this.all());
    }
    else if (list_id == "search") {
      callback(null, this.search(variant));
    }
    else {
      app.list.findById(list_id, function(err, list) {
        if (err) {
          callback(err);
        }
        else {
          list ? callback(null, list) : callback("List not found");
        }
      });
    }
  }

  /**
   * Sort lists for display in navidation.
   */
  listSchema.statics.sortNavigation = function(lists) {
    var all = [];
    var directories = [];
    var channels = [];

    function sort(a, b) {
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    }

    for (var i in lists) {
      if (lists[i].type == "all") {
        all.push(lists[i]);
      }
      else if (lists[i].type == "directory") {
        directories.push(lists[i]);
      }
      else {
        channels.push(lists[i]);
      }
    }

    directories.sort(sort);
    channels.sort(sort);

    return all.concat(directories).concat(channels);
  }

  /**
   * Generate the special "search" list definition.
   */
  listSchema.statics.search = function(query) {
    return {_id: "search", type: "search", name: "Search for " + query};
  }

  /**
   * Return the list of all possible variants.
   */
  listSchema.statics.variants = function() {
    return {
      time: "Most recent",
      day: "Popular today",
      week: "Popular last week",
      month: "Popular last month",
      year: "Popular last year",
      all: "Most popular of all time",
    };
  }

  this.list = app.db.model('List', listSchema, 'lists');
}
