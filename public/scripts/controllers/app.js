require(["pagetty"], function(pagetty) {
  $(document).ready(function() {
    pagetty.init(channels);

    var hash = new String(window.location.hash);

    if (hash && hash != "#top" && hash != "#recent") {
      pagetty.showChannel(hash.substring(1));
    }
    else {
      pagetty.showSpecial(hash.substring(1));
    }

    $("#nav-channels li.channel a").bind("click", function() {
      pagetty.showChannel($(this).data("channel"));
    });
    $("#nav-channels li.recent a").bind("click", function() {
      pagetty.showSpecial("recent");
    });
    $("#nav-channels li.top a").bind("click", function() {
      pagetty.showSpecial("top");
    });

    window.setInterval(function() {
      pagetty.updateChannels();
    }, 30000);
  });
});
