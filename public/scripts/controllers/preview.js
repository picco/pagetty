require([
  'pagetty',
  'icanhaz'
], function(Pagetty) {

Controller = {
  init: function() {
    var html = Pagetty.renderChannelItems(channel.items, channel);
    $('#runway').html(html);
  }
};

$(document).ready(function() {
  Controller.init();
});

});
