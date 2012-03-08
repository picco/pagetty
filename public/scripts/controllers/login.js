require([
  'pagetty',
  'icanhaz'
], function(Pagetty) {

Controller = {
  init: function() {
    $('#login input.name').focus();
    $('#login a.login').click(Controller.login);
    $('#login input').keyup(function(e) {
      if (e.keyCode == 13) Controller.login();
    });
  },
  login: function() {
    var name = $('#login input.name').val();
    var pass = $('#login input.pass').val();

    $.ajax('/login', {type: 'POST', data: {name: name, pass: pass}})
      .success(function() {
        window.location = '/app';
      })
      .error(function() {
        alert("Something went wrong while logging.");
      });
    return false;
  }
};

$(document).ready(function() {
  Controller.init();
});

});
