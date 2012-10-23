var broadway = require('broadway');
var app = new broadway.App();

// Load plugins.
app.use(require('./plugins/main.js'));

if (process.argv[2] == 'm1') {
  // Adds title selector/attribute to rules.
  app.rule.find({}, function(err, rules) {
    for (var i in rules) {
      rules[i].title = {selector: rules[i].target.selector, attribute: rules[i].target.title_attribute}
      rules[i].target= {selector: rules[i].target.selector, attribute: rules[i].target.url_attribute};
      rules[i].save();
    }
  });
}