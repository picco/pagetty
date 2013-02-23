var broadway = require('broadway');
var app = new broadway.App();

// Load root plugin.
app.use(require('./plugins/main.js'));

function crawlBatch(updates) {
  if (updates) {
    app.channel.crawlBatch(crawlBatch);
  }
  else {
    console.log("Waiting...");
    setInterval(function() {crawlBatch()}, 10000);
  }
}

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
        else if (channel) {
          channel.crawl(function() {
            console.log("Update done.");
            process.exit();
          });
        }
        else {
          console.log("Channel not found.");
          process.exit();
        }
      })
    }
    else {
      crawlBatch(true);
    }
  }
});
