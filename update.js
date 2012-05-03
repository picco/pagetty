var logger     = require(__dirname + "/lib/logger.js");
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
    logger.log.info("Update: Executing new batch...");

    pagetty.updateChannels(false, function() {
      last_update = new Date().getTime();
    });
  }
  else {
    logger.log.info("Update: Waiting, only " + (now - last_update) + " has passed...");
  }
}
