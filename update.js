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
    var channels = pagetty.loadChannelsForUpdate();

    channels.each(function(err, channel) {
      if (err) throw err;

      if (channel) {
        pagetty.updateChannelItems(channel, function(err) {
          if (err) throw err;

          console.log('Update completed for: ' + channel.name);
          last_update = new Date().getTime();
        });
      }
    });
  }
  else {
    console.log("Waiting, only " + (now - last_update) + " has passed...");
  }
}

