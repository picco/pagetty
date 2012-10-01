var broadway = require('broadway');
var app = new broadway.App();

// Load root plugin.
app.use(require('./plugins/main.js'));

// Launcher
app.init(function (err) {
  if (err) {
    console.log(err);
  }
  else {
    if (process.argv[2]) {
      app.channel.findById(process.argv[2], function(err, channel) {
        if (err) {
          throw err;
        }
        else {
          channel.updateItems(false, function() {
            console.log("Update done.");
            process.exit();
          });
        }
      })
    }
    else {
      app.lastUpdate = new Date().getTime();
      app.channel.updateItemsBatch(true);
      setInterval(function() {app.channel.updateItemsBatch()}, 10000);
    }
  }
});
