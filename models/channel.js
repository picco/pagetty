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

  this.channel = app.db.model('Channel', channelSchema, 'channels');
}
