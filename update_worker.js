var
  pagetty = require('./pagetty.js');

process.on('message', function(config) {
console.dir(process.env);
console.dir(config);
console.log('In child process.');

  pagetty.init(config, function() {
    pagetty.loadChannelForUpdate(function(channel) {
      if (channel) {
        console.log('Channel loaded: ' + channel.name);

        pagetty.updateChannel(channel, function() {
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