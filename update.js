var logger     = require(__dirname + "/lib/logger.js");
var pagetty = require("./lib/pagetty.js");
var last_update = new Date().getTime();
var timeout = 60 * 1000;

pagetty.init(function() {
  if (process.argv[2]) {
    pagetty.updateChannelItems(process.argv[2], function() {
      logger.log.info("Update done.");
      process.exit();
    });
  }
  else {
    update(true);
    setInterval(update, timeout);
  }
});

function update(force) {
  var now = new Date().getTime();

  if (force || now - last_update >= timeout) {
    logger.log.info("Update: Executing new batch...");

    pagetty.updateChannelItems(false, function() {
      last_update = new Date().getTime();
    });
  }
  else {
    logger.log.info("Update: Waiting, only " + (now - last_update) + " has passed...");
  }
}
