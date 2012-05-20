require.config({
  paths: {
    moment: "libraries/moment",
    history: "libraries/jquery.history",
    icanhaz: "libraries/icanhaz",
    nicescroll: "libraries/jquery.nicescroll.min",
    pagetty: "libraries/pagetty",
    timeago: "libraries/jquery.timeago",
    ui: "libraries/jquery-ui.min",
    underscore: "libraries/underscore",
    url: "libraries/jquery.url"
  }
});

require(["nicescroll", "ui"], function() {
  $(function() {
    $(document).ready(function() {
      $(".logo").click(function() {
        window.location = '/';
      });
    });
  });
});