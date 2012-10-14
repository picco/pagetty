require([
  'pagetty',
], function(pagetty) {

Controller = {
  init: function() {
    $(".subscribe-form").bind("submit", Controller.subscribe);
  },
  subscribe: function() {
      $.ajax("/subscribe", {
        type: "POST",
        data: {url: $(".subscribe-url").val(), name: $(".subscribe-name").val()},
        dataType: "json",
        success: function(data) {
          window.location = data.item_count ? ("/channel/" + data.channel_id) : ("/channel/" + data.channel_id + "/configure?empty");
        },
        error: function(xhr, status, error) {
          pagetty.error(xhr.responseText);
        }
      });

    return false;
  }
};

$(document).ready(function() {
  Controller.init();
});

});
