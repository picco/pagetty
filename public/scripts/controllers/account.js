require([
  'pagetty',
], function(pagetty) {

Controller = {
  init: function() {
    $(".account-form").bind("submit", Controller.submit);
    $(".preferences-form").bind("submit", Controller.savePreferences);
    $(".btn-delete").click(Controller.deleteAccount);
  },
  submit: function() {
    var data = {
      existing_pass: $('input.existing-pass').val(),
      pass: $('input.pass').val(),
      pass2: $('input.pass2').val(),
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
  savePreferences: function() {
    var data = {style: $(".style").val()};

    $.ajax("/preferences", {type: "POST", data: data})
      .success(function() {
        pagetty.success('Preferences have been updated.');
      })
      .error(function(xhr, status, error) {
        pagetty.error(xhr.responseText);
      }
    );

    return false;
  },
  deleteAccount: function() {
    if (confirm("Are you sure? Your account and all your user data will be deleted immediately!")) {
      $.get('/account/delete')
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
