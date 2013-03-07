var broadway = require('broadway');
var app = new broadway.App();

// Load plugins.
app.use(require('./plugins/main.js'));
app.use(require('./plugins/server.js'));

// Launcher.
app.init(function (err) {
  if (err) console.log(err);
});
