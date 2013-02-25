var broadway = require('broadway');
var app = new broadway.App();

// Load root plugin.
app.use(require('./plugins/main.js'));

function crawlBatch(updates) {
  if (updates) {
    app.channel.crawlBatch(function(updates) {crawlBatch(updates)});
  }
  else {
    console.log("Waiting...");
    setTimeout(function() {crawlBatch(true)}, 30000);
  }
}

// Crawl launcher
app.init(function (err) {
  if (err) {
    console.log(err);
  }
  else {
    if (process.argv[3]) {
      app.channel.findById(process.argv[3], function(err, channel) {
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
