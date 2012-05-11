require([
  "pagetty",
  "icanhaz"
], function(Pagetty) {

Controller = {
  init: function() {
    $("#url").focus();
    $("#url").keyup(function(e) {
      if (e.keyCode == 13) Controller.continue();
    });
    $("#continue").click(function() {
      Controller.continue();
    });
  },
  continue: function() {
    window.location = "/subscribe/" + encodeURIComponent($("#url").val());
    return false;
  },
};

$(document).ready(function() {
  Controller.init();
});

});
