require.config({
  paths: {
    underscore: 'libraries/ext/underscore',
    backbone: 'libraries/ext/backbone',
    icanhaz: 'libraries/ext/icanhaz',
    lazyload: 'libraries/ext/jquery.lazyload.min',
    nicescroll: 'libraries/ext/jquery.nicescroll.min',
    timeago: 'libraries/ext/jquery.timeago',
    url: 'libraries/ext/jquery.url',
    ui: 'libraries/ext/jquery-ui.min',
    pagetty: 'libraries/pagetty'
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