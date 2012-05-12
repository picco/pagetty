require([
  'pagetty',
  'text!templates/channel_form_component.html',
  'icanhaz'
], function(Pagetty, channelFormComponent) {

  ChannelFormController = {

    init: function() {
      ich.addTemplate('channel_form_component', channelFormComponent);

      $('#channel-form input.refresh').click(function(e) {
        $('#preview .container').html('');
        ChannelFormController.testConfiguration();
      });

      if (channel_id) {
        ChannelFormController.testConfiguration();
      }
    },

    testConfiguration: function() {
      $.ajax('/channel/validate', {
        type: 'POST',
        data: ChannelFormController.getChannelData(),
        success: ChannelFormController.validateSuccessCallback,
        error: ChannelFormController.validateErrorCallback
      });
    },

    validateSuccessCallback: function(data, status) {
      $('#actions .save').attr('disabled', '');
      var html = Pagetty.renderChannelItems(data.items, data, true);
      $('#preview .container').html(html);
      $('#preview .item img.lazy').lazyload();
    },

    validateErrorCallback: function(xhr, status, error) {
      $('#actions .save').attr('disabled', '');
      alert('submit error');
    },
  }

  $(document).ready(function() {
    ChannelFormController.init();
  });

});
