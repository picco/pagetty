require([
  "pagetty",
  "icanhaz"
], function(Pagetty) {

Controller = {
  init: function() {
    $("#name").focus();
    $("#subscribe").click(function() {
      Controller.subscribe();
    });
  },
  subscribe: function() {
    $.ajax("/subscribe", {type: 'POST', data: {url: $("#url").val(), name: $("#name").val(), target: $("#target").val()}})
      .success(function() {
        window.location = "/";
      })
      .error(function() {
        alert("Something went wrong while subscribing.");
      });

    return false;
  },
};

$(document).ready(function() {
  Controller.init();
});

});
