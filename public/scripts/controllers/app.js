require(["pagetty"], function(pagetty) {
  $(document).ready(function() {
    pagetty.init(user, channels);

    var hash = new String(window.location.hash);

    if (hash.length && hash != "#all") {
      pagetty.showChannel(hash.substring(1));
    }
    else {
      pagetty.showChannel("all", "time");
    }

    $("#nav-channels li.channel a").bind("click", function() {
      pagetty.showChannel($(this).data("channel"), $(this).data("variant"));
    });

    $("a.channel-variant").live("click", function() {
      pagetty.showChannel($(this).data("channel"), $(this).data("variant"));
    });

    $("#nav-channels li.all a").bind("click", function() {
      pagetty.showChannel("all", "time");
    });

    $("#nav-channels li.top a").bind("click", function() {
      pagetty.showChannel("all", "score");
    });

    $("#refresh a").bind("click", function() {
      pagetty.refreshChannels();
      return false;
    });

    $("#add-subscription .btn-subscribe").click(function() {
      pagetty.clearMessages();

      $.ajax("/subscribe", {
        type: "POST",
        data: {url: $(".subscribe-url").val()},
        success: function(data) {
          window.location = "/configure/" + data.channel_id;
        },
        error: function(xhr, status, error) {
          pagetty.error(xhr.responseText, "subscribe-messages");
        }
      });
    });

    // Lazy load additional stories when the page is scrolled near to the bottom.

    $(window).scroll(function() {
      if ($(window).scrollTop() + $(window).height() >= $(document).height() - 60) {
        pagetty.autoload();
      }
    });

    // Fancy logo animations.

    $(".logo").animate({"padding-top": "60px"}, 1000, "easeOutBack");

    $(".logo").hover(function() {
      $(".logo").animate({"padding-top": "65px"}, 500, "easeOutBack");
    }, function() {
      $(".logo").animate({"padding-top": "60px"}, 200, "easeOutBack");
    });

    // Fade in.

    //$(".runway, aside").css("visibility", "visible").animate({opacity: 1}, 500);

    // When the window is resized we need to adjust the dimensions of some elements.

    $(window).resize(pagetty.updateUI);

    /* Key bindings:
     *
     * Right: Scroll to next story.
     * Left: Scroll to provious story.
     */

    $(document).keydown(function(e) {
      if (e.ctrlKey == true && e.altKey == false && e.shiftKey == false) {
        if (e.keyCode == 32) {
          //pagetty.refreshChannels();
          //return false;
        }
        else if (e.keyCode == 38) {
          pagetty.openPrevItem();
          return false;
        }
        else if (e.keyCode == 40) {
          pagetty.openNextItem();
          return false;
        }
      }
      else if (e.ctrlKey == false && e.altKey == true && e.shiftKey == false) {
        if (e.keyCode == 37) {
          pagetty.openPrevVariant();
          return false;
        }
        else if (e.keyCode == 39) {
          pagetty.openNextVariant();
          return false;
        }
        else if (e.keyCode == 40) {
          pagetty.openNextChannel();
          return false;
        }
        else if (e.keyCode == 38) {
          pagetty.openPrevChannel();
          return false;
        }
        else if (e.keyCode >= 48 && e.keyCode < 90) {
          pagetty.openChannelByKey(String.fromCharCode(e.keyCode));
          return false;
        }
      }
    });

    // Auto-update channels.

    window.setInterval(function() {
      pagetty.updateChannels();
    }, 60000);
  });
});
