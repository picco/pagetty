require([
  'pagetty',
  'icanhaz'
], function(Pagetty) {

Controller = {
  init: function() {
    $('#signup a.signup').click(function() {
      Controller.signup($('#signup input.mail').val());
    });
  },
  signup: function(mail) {
    $.ajax('/signup', {type: 'POST', data: {mail: mail}})
      .success(function() {
        alert("Success");
      })
      .error(function() {
        alert("Something went wrong while subscribing.");
      });
  }
};

$(document).ready(function() {
  Controller.init();
});

});
