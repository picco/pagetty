var pagetty = require("./lib/pagetty.js");

pagetty.fetchData({url: 'http://images.anandtech.com/doci/5549/MSI%20Big%20Bang-XPower%20II_picture_boxshot_575px.png'}).done(function(err, response, body) {
  console.log(err);
  console.log(body);
});