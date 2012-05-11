var parser = require(__dirname + "/parser.js");

process.on("message", function(m) {
  parser.process(m.html, m.channel, m.rules, function(items) {
    process.send(items);
    process.exit();
  });
});