var pagetty = require('./pagetty.js');

console.log('In child process.');

pagetty.init(function() {
  console.log('Pagetty initialized.');
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
