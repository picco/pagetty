require([
  'pagetty',
], function(pagetty) {

Controller = {
  init: function() {
    $(".password-form").bind("submit", Controller.submit);
  },
  submit: function() {
    $.ajax('/password', {type: 'POST', data: {mail: $('input.mail').val(), _csrf: _csrf}})
      .success(function() {
        pagetty.success('Check your e-mail!');
      })
      .error(function(xhr, status, error) {
        pagetty.error('An error occurred.');
      }
    );

    return false;
  }
};

$(document).ready(function() {
  Controller.init();
});

});
