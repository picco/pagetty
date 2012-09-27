require([
  "pagetty",
], function(pagetty) {

Controller = {  
  init: function() {  
    $(".btn-save").click(this.save);

    $(".name").keypress(function(e) {
      if (e.keyCode == 13) Controller.save();
    });
    
    $(".btn-unsubscribe").click(function() {
      $.ajax("/unsubscribe", {
        type: "POST",
        data: {channel_id: channel_id},
        success: Controller.unsubscribeSuccessCallback,
        error: Controller.unsubscribeErrorCallback
      });
    });
  },
  save: function() {
    $.ajax("/subscription", {
      type: "POST",
      data: {channel_id: channel_id, name: $("#subscription input.name").val()},
      success: Controller.saveSuccessCallback,
      error: Controller.saveErrorCallback
    });
  },
  saveSuccessCallback: function(data, status) {
    pagetty.success('Changes saved.');
  },
  saveErrorCallback: function(xhr, status, error) {
    pagetty.error(xhr.responseText);
  },
  unsubscribeSuccessCallback: function(data, status) {
    window.location = "/";
  },
  unsubscribeErrorCallback: function(xhr, status, error) {
    pagetty.error(xhr.responseText);
  }
};

$(document).ready(function() {
  Controller.init();
});

});
