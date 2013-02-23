exports.attach = function(options) {
  var app = this;
  var mongoose = require('mongoose');

  var listSchema = mongoose.Schema({
    user_id: {type: mongoose.Schema.Types.ObjectId, index: true},
    channel_id: {type: mongoose.Schema.Types.ObjectId, index: true},
    type: {type: String, index: true},
    domain: String,
    link: String,
    name: String,
    weight: Number,
  });

  /**
   * Validate the entity before saving.
   */
  listSchema.pre("save", function(next) {
    var validator = app.getValidator();

    validator.check(this.name, "Name must start with a character.").is(/\w+.*/);

    if (validator.hasErrors()) {
      next(new Error(validator.getErrors()[0]));
    }
    else {
      next();
    }
  });

  /**
   * Generate the special "all" list definition.
   */
  listSchema.statics.all = function() {
    return {_id: "all", type: "all", name: "All stories", icon: 'https://s2.googleusercontent.com/s2/favicons?domain=pagetty.com'};
  }

  /**
   * Prepare list for output.
   */
  listSchema.statics.prepare = function(list, variant) {
    var variants = {
      time: "Most recent",
      day: "Popular today",
      week: "Popular last week",
      month: "Popular last month",
      year: "Popular last year",
      all: "Most popular of all time",
    };

    list["variant_name"] = variants[variant];
    list["active_" + variant] = "active";
    return list;
  }

  /**
   * Create necessary lists upon user signup.
   */
  listSchema.statics.createUserDefaults = function(user, callback) {
    app.list.create({user_id: user._id, type: "all", name: "All stories", weight: 0}, function(err) {
      if (err) console.log(err);
      callback(err);
    });
  }

  /**
   * Create necessary lists upon user signup.
   */
  listSchema.statics.createFromChannel = function(user_id, channel, name, callback) {
    app.list.create({user_id: user_id, channel_id: channel._id, type: "channel", domain: channel.domain, link: channel.link, name: name, weight: 0}, function(err, list) {
      if (err) console.log(err);
      callback(err, list);
    });
  }

  this.list = app.db.model('List', listSchema, 'lists');
}
