require([
  'pagetty',
  'icanhaz',
  'url'
], function(pagetty) {

Controller = {
  init: function() {
    $('.btn-activate').click(function() {
      Controller.activate({

      });
      return false;
    });
  },
  activate: function(data) {
    $.ajax(window.location.href, {type: 'POST', data: data})
      .success(function() {
        window.location = '/';
      })
      .error(function(xhr, status, error) {
        pagetty.error(xhr.responseText);
      }
    );
  }
};

$(document).ready(function() {
  Controller.init();
});

});
