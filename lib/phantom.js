var page = require('webpage').create();
var system = require('system');

page.open(system.args[1], function (status) {
  console.log(page.content);
  phantom.exit();
});
