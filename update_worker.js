process.env.NODE_ENV = 'development';
var pagetty = require('./lib/pagetty.js');

process.on('message', function(params) {
  pagetty.init(function() {
    pagetty.loadChannelForUpdate(function(channel) {
      if (channel) {
        console.log('Channel loaded: ' + channel.name);

        pagetty.updateChannelItems(channel, function() {
          console.log('Update completed.');
          process.exit();
        });
      }
      else {
        console.log('No channels to update.');
        process.exit();
      }
    });
  });
});
