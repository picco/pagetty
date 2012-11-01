exports.attach = function(options) {
  var app = this;
  var _ = require('underscore');
  var async = require('async');
  var mongoose = require('mongoose');

  var stateSchema = mongoose.Schema({
    user: {type: mongoose.Schema.Types.ObjectId, index: {unique: true}},
    data: mongoose.Schema.Types.Mixed,
  });

  stateSchema.methods.update = function(user, callback) {
    var self = this;
    var count = 0;

    if (_.size(user.subscriptions)) {
      for (var channel_id in user.subscriptions) {
        app.channel.findById(channel_id, function(err, channel) {
          if (err) {
            next(err)
          }
          else {
            if (self.data.channels[channel._id] && _.size(self.data.channels[channel._id].items)) {
              var items = [];

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
                      // We need to keep the isnew status.
                      item.isnew = self.data.channels[channel._id].items[j].isnew;
                      // Push to the items array.
                      // Convert to timestamp
                      item.created = item.created.getTime();
                      items.push(item);
                      // Correct match is found, break the loop.
                      break;
                    }
                  }

                  if (!item_found) {
                    var item = channel.items[i];

                    if (item.created) {
                      // This is a new item.
                      item.isnew = true;
                      // Convert to timestamp
                      item.created = item.created.getTime();
                      // Push to items array.
                      items.push(item);
                    }
                  }
                }
              }

              self.data.channels[channel._id].items = items;
            }
            else {
              // Create channel object if not present (happens after subscribing).
              if (!self.data.channels[channel._id]) self.data.channels[channel._id] = {};

              // There's no existing state, just use all the fresh items.
              self.data.channels[channel._id].items = _.clone(channel.items);

              // And mark them as new.
              for (var i in self.data.channels[channel._id].items) {
                self.data.channels[channel._id].items[i].isnew = true;
                self.data.channels[channel._id].items[i].created = self.data.channels[channel._id].items[i].created.getTime();
              }
            }

            // Always update the items_added timestamp.
            if (channel.items_added) self.data.channels[channel._id].items_added = channel.items_added.getTime();

            // Fire callback when finished.
            if (++count >= _.size(user.subscriptions)) {
              self.markModified('data');
              self.save(function(err) {
                callback(self);
              });
            }
          }
        });
      }
    }
    else {
      callback(self);
    }
  };

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
          state.data.channels[channel._id] = {items: [], items_added: channel.items_added.getTime()};

          if (channel.items) {
            for (var i in channel.items) {
              var item = channel.items[i];

              if (item.created) {
                item.isnew = true;
                item.created = item.created.getTime();
                state.data.channels[channel._id].items.push(item);
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
