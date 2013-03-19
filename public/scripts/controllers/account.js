require([
  'pagetty',
], function(pagetty) {

Controller = {
  init: function() {
    $(".account-form").bind("submit", Controller.submit);
    $(".btn-delete").click(Controller.deleteAccount);
  },
  submit: function() {
    var data = {
      existing_pass: $('input.existing-pass').val(),
      pass: $('input.pass').val(),
      pass2: $('input.pass2').val(),
      _csrf: _csrf,
    }

    $.ajax('/account', {type: 'POST', data: data})
      .success(function() {
        pagetty.success('Password has been updated.');
      })
      .error(function(xhr, status, error) {
        pagetty.error(xhr.responseText);
      }
    );

    return false;
  },
  deleteAccount: function() {
    if (confirm("Are you sure? Your account and all your user data will be deleted immediately!")) {
      $.ajax("/account/delete", {type: "POST", data: {_csrf: _csrf}})
       .success(function() {
         window.location = '/';
       })
       .error(function(xhr, status, error) {
         pagetty.error(xhr.responseText);
       }
     );
    }
  }
};

$(document).ready(function() {
  Controller.init();
});

});
