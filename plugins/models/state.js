exports.attach = function(options) {
  var app = this;
  var _ = require('underscore');
  var async = require('async');
  var mongoose = require('mongoose');

  var stateSchema = mongoose.Schema({
    user: {type: mongoose.Schema.Types.ObjectId, index: {unique: true}},
    data: mongoose.Schema.Types.Mixed,
  });

  /**
   * Updates the new items count of the user's state.
   */
  stateSchema.methods.updateNewItemsCount = function(user, callback) {
    var self = this;
    var count = 0;
    var new_items = 0;
    var stamp = self.data.stamp || 0;

    if (_.size(user.subscriptions)) {
      for (var channel_id in user.subscriptions) {
        app.channel.findById(channel_id, function(err, channel) {
          if (err) {
            callback(err);
            return;
          }
          else {
            if (_.size(channel.items)) {
              for (var i in _.keys(channel.items)) {
                if (_.has(channel.items, i)) {
                  if (channel.items[i].created.getTime() > stamp) new_items++;
                }
              }
            }
          }

          // Fire callback when finished.

          if (++count >= _.size(user.subscriptions)) {
            self.data.new_items = new_items;
            self.markModified('data');
            self.save(function(err) {
              callback(self);
            });
          }
        });
      }
    }
    else {
      callback(self);
    }
  }

  stateSchema.methods.refresh = function(user, channel_id, callback) {
    var self = this;
    var channels = {};
    var count = 0;
    var new_stamp = 0;

    function complete() {
      // Do not reset if refreshing a single channel.
      if (!channel_id) {
        self.data.stamp = new_stamp;
        self.data.new_items = 0;
      }
      self.markModified('data');
      self.save(function(err) {
        callback(self);
      });
    }

    if (channel_id) {
      channels[channel_id] =  true;
    }
    else {
      channels = user.subscriptions || {};
    }

    if (_.size(channels)) {
      for (var cid in channels) {
        app.channel.findById(cid, function(err, channel) {
          console.dir(channel);
          console.dir(err);
          if (err) {
            next(err)
          }
          else {
            var items_added = self.refreshChannelItems(channel);

            // Always update the items_added timestamp.
            if (items_added) {
              items_added = channel.items_added.getTime();
              self.data.channels[channel._id].items_added = items_added;
              // Calculate the new state stamp which equals to the maximum items_added value in the latest refresh.
              if (items_added > new_stamp) new_stamp = items_added;
            }

            if (++count >= _.size(channels)) complete();
          }
        });
      }
    }
    else {
      callback(self);
    }
  };

  /**
   * Refreshes the state of single channel.
   */
  stateSchema.methods.refreshChannelItems = function(channel) {
    var self = this;
    var items = [];
    var stamp = self.data.stamp || 0;

    // Check that all subscribed channels are present and add if necessary.

    if (!this.data.channels[channel._id] || !this.data.channels[channel._id].items) {
      this.data.channels[channel._id] = {items: _.clone(channel.items) || []};
    }

    for (var i in _.keys(channel.items)) {
      // channel.items is not a simple data object.
      if (_.has(channel.items, i)) {
        var item_found = false;

        for (var j in self.data.channels[channel._id].items) {
          // fails without toString().
          if (channel.items[i].id.toString() == self.data.channels[channel._id].items[j].id.toString()) {
            var item_found = true;

            // The the new item as the base.
            var item = _.clone(channel.items[i]);
            // Convert to timestamp
            item.created = item.created.getTime();
            // Calculate the isnew status.
            item.isnew = item.created > stamp;
            // Push to the items array.
            items.push(item);
            // Correct match is found, break the loop.
            break;
          }
        }

        if (!item_found) {
          var item = channel.items[i];

          if (item.created) {
            // Convert to timestamp
            item.created = item.created.getTime();
            // This is a new item.
            item.isnew = item.created > stamp;
            // Push to items array.
            items.push(item);
          }
        }
      }
    }

    self.data.channels[channel._id].items = items;
    return channel.items_added;
  }

  /**
   * TODO
   */
  stateSchema.statics.generate = function(user, callback) {
    var self = this;
    var count = 0;
    var state = {user: user._id, data: {channels: {}}};

    if (_.size(user.subscriptions)) {
      for (var channel_id in user.subscriptions) {
        app.channel.findById(channel_id, function(err, channel) {
          state.data.channels[channel._id] = {items: [], items_added: null};
          if (channel.items_added) state.data.channels[channel._id] = {items: [], items_added: channel.items_added.getTime()};

          if (channel.items) {
            for (var i in channel.items) {
              if (_.has(channel.items, i)) {
                var item = channel.items[i];

                if (item.created) {
                  item.isnew = true;
                  item.created = item.created.getTime();
                  state.data.channels[channel._id].items.push(item);
                }
              }
            }
          }

          // Finished test.
          if (++count >= _.size(user.subscriptions)) {
            self.create(state, function(err, created_state) {
              callback(err, created_state);
            });
          }
        });
      }
    }
    else {
      callback(null, state);
    }
  }

  this.state = this.db.model('State', stateSchema, 'state');
}
