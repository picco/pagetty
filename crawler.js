var broadway = require('broadway');
var app = new broadway.App();

// Load root plugin.
app.use(require('./plugins/main.js'));

function crawlBatch(updates) {
  if (updates) {
    app.channel.crawlBatch(function(updates) {crawlBatch(updates)});
  }
  else {
    app.log("crawler.js", "waiting...");
    setTimeout(function() {crawlBatch(true)}, 30000);
  }
}

// Crawl launcher
app.init(function(err) {
  if (err) {
    app.log(err);
  }
  else {
    app.log("crawler.js", "started");

    if (process.argv[2]) {
      app.channel.findById(process.argv[2], function(err, channel) {
        if (err) {
          throw err;
        }
        else if (channel) {
          channel.crawl(function() {
            app.log("crawler.js", "channel crawl complete");
            process.exit();
          });
        }
        else {
          app.err("crawler.js", "channel not found");
          process.exit();
        }
      })
    }
    else {
      crawlBatch(true);
    }
  }
});
