require([
  'pagetty',
  'icanhaz',
  'url'
], function(pagetty) {

Controller = {
  init: function() {
    $(".signup-form").bind("submit", Controller.signup);
  },
  signup: function() {
    var data = {
      mail: $(".input-mail").val(),
      pass: $('input.pass').val(),
      pass2: $('input.pass2').val()
    }

    $.ajax('/signup', {type: 'POST', data: data})
      .success(function() {
        window.location = '/signup/verification';
      })
      .error(function(xhr, status, error) {
        pagetty.error(xhr.responseText);
      }
    );

    return false;
  }
};

$(document).ready(function() {
  Controller.init();
});

});
