var broadway = require('broadway');
var app = new broadway.App();

app.use(require('./plugins/main.js'));
app.use(require('./plugins/crawler.js'));

function crawlWhile(updates) {
  if (updates) {
    app.crawler.crawlBatch(function(updates) {crawlWhile(updates)});
  }
  else {
    app.log("crawler.js", "waiting...");
    setTimeout(function() {crawlWhile(true)}, 30000);
  }
}

app.init(function(err) {
  if (err) {
    app.log(err);
  }
  else {
    app.log("crawler.js", "started");

    if (process.argv[2]) {
      // Launch the crawl process for a single channel.
      app.channel.findById(process.argv[2], function(err, channel) {
        if (err) {
          app.err(err);
        }
        else if (channel) {
          app.crawler.crawl(channel, function() {
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
      crawlWhile(true);
    }
  }
});
