require([
  'pagetty',
  'icanhaz'
], function(Pagetty) {

Controller = {
  init: function() {
    $('div.subscription a.subscribe').click(function() {
      Controller.subscribe($(this).data('channel'), this);
      return false;
    });
    $('div.subscription a.unsubscribe').click(function() {
      Controller.unsubscribe($(this).data('channel'), this);
      return false;
    });
  },
  subscribe: function(channel_id, self) {
    $.ajax('/subscribe/' + channel_id)
      .success(function() {
        $(self).parent().removeClass('unsubscribed').addClass('subscribed');
      })
      .error(function() {
        alert("Something went wrong while subscribing.");
      });
  },
  unsubscribe: function(channel_id, self) {
    $.ajax('/unsubscribe/' + channel_id)
      .success(function() {
        $(self).parent().removeClass('subscribed').addClass('unsubscribed');
      })
      .error(function() {
        alert("Something went wrong while unsubscribing.");
      });
  },
};

$(document).ready(function() {
  Controller.init();
});

});
