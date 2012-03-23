var pagetty = require("./lib/pagetty.js");
var last_update = new Date().getTime();
var timeout = 60 * 1000;

pagetty.init(function() {
  update(true);
  setInterval(update, timeout);
});

function update(force) {
  var now = new Date().getTime();

  if (force || now - last_update >= timeout) {
    console.log("Executing new batch...");

    pagetty.loadChannelsForUpdate().each(function(err, channel) {
      if (err) throw err;

      if (channel) {
        pagetty.updateChannelItems(channel, function(err, updated_channel) {
          if (err) {
            console.log('Update failed for: ' + channel.name);
          }
          else {
            console.log('Update completed for: ' + updated_channel.name);
          }
          last_update = new Date().getTime();
        });
      }
      else {
        console.log("Nothing more to update, it seems...");
      }
    });
  }
  else {
    console.log("Waiting, only " + (now - last_update) + " has passed...");
  }
}
