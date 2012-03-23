require(["pagetty"], function(pagetty) {
  $(document).ready(function() {
    pagetty.init(channels);

    var hash = new String(window.location.hash);

    if (hash.length && hash != "#top" && hash != "#recent") {
      pagetty.showChannel(hash.substring(1));
    }
    else {
      pagetty.showSpecial("recent");
    }

    $("#nav-channels li.channel a").bind("click", function() {
      pagetty.showChannel($(this).data("channel"));
      //return false;
    });

    $("#nav-channels li.recent a").bind("click", function() {
      pagetty.showSpecial("recent");
      //return false;
    });

    $("#nav-channels li.top a").bind("click", function() {
      pagetty.showSpecial("top");
      //return false;
    });

    $("#refresh .refresh").bind("click", function() {
      pagetty.refreshChannels();
      return false;
    });

    $("#refresh .up").bind("click", function() {
      $(window).scrollTop(0);
      return false;
    });

    $(window).scroll(function() {
      if ($(window).scrollTop() + $(window).height() >= $(document).height() - 60) {
        pagetty.autoload();
      }
    });

    $(".logo").animate({"padding-top": "60px"}, 1000, "easeOutBack");

    $(".logo").hover(function() {
      $(".logo").animate({"padding-top": "65px"}, 500, "easeOutBack");
    }, function() {
      $(".logo").animate({"padding-top": "60px"}, 200, "easeOutBack");
    });

    $(".runway, aside").css("visibility", "visible").animate({opacity: 1}, 500);

    $(window).resize(pagetty.updateUI);

    $(document).keydown(function(e) {
      if (e.keyCode == 39) {
         pagetty.nextItem();
      }
      else if (e.keyCode == 37) {
         pagetty.prevItem();
      }
    });

    window.setInterval(function() {
      pagetty.updateChannels();
    }, 10000);
  });
});
