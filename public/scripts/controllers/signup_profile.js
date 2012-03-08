require([
  'pagetty',
  'icanhaz',
  'url'
], function(Pagetty) {

Controller = {
  init: function() {
    $('#signup-profile a.activate').click(function() {
      Controller.activate({
        user_id: $.url().segment(3),
        name: $('#signup-profile input.name').val(),
        pass: $('#signup-profile input.pass').val(),
        pass2: $('#signup-profile input.pass2').val()
      });
      return false;
    });
  },
  activate: function(data) {
    $.ajax('/signup/profile/', {type: 'POST', data: data})
      .success(function() {
        alert("Success");
      })
      .error(function() {
        alert("Something went wrong while subscribing.");
      }
    );
  }
};

$(document).ready(function() {
  Controller.init();
});

});
