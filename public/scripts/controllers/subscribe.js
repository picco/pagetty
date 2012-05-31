require(["pagetty"], function(pagetty) {
  $(document).ready(function() {
    $(".btn-subscribe").click(function() {
      pagetty.clearMessages();

      $.ajax("/subscribe", {
        type: "POST",
        data: {url: $(".subscribe-url").val()},
        success: function(data) {
          window.location = "/";
        },
        error: function(xhr, status, error) {
          pagetty.error(xhr.responseText, "subscribe-messages");
        }
      });
    });
  });
});
