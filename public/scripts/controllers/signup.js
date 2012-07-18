require([
  'pagetty',
  'icanhaz',
  'url'
], function(Pagetty) {

Controller = {
  init: function() {
    $(".signup-form").bind("submit", Controller.signup);
  },
  signup: function() {
    var data = {
      username: $(".input-username").val(),
      mail: $(".input-mail").val(),      
    }
    
    $.ajax('/signup', {type: 'POST', data: data})
      .success(function() {
        alert("Success");
      })
      .error(function() {
        alert("Something went wrong while subscribing.");
      }
    );
      
    return false;
  }
};

$(document).ready(function() {
  Controller.init();
});

});
