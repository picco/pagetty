require([
  'pagetty',
  'text!templates/channel_form_component.html',
  'icanhaz'
], function(Pagetty, channelFormComponent) {

  ChannelFormController = {

    init: function() {
      ich.addTemplate('channel_form_component', channelFormComponent);

      $('#channel-form .add-rule').click(function() {
        $('#channel-form .components').append(ich.channel_form_component());
      });

      $('#channel-form input.refresh').click(function(e) {
        $('#preview .container').html('');
        ChannelFormController.testConfiguration();
      });

      $('#channel-form input.save').click(function(e) {
        $.ajax('/channel/save', {
          type: 'POST',
          data: ChannelFormController.getChannelData(),
          success: ChannelFormController.saveSuccessCallback,
          error: ChannelFormController.saveErrorCallback
        });
      });

      $('#form .remove').live('click', function(e) {
        $(this).parent().remove();
        return false;
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

    getChannelData: function() {
      var attrs = {
        _id: channel_id,
        name: $('#channel-form input.name').val(),
        uri: $('#channel-form input.uri').val(),
        base_uri: $('#channel-form input.base_uri').val(),
        components: []
      };

      var components = $('#channel-form .component').get();

      for (var i in components) {
        attrs.components.push({
          item: $('.item', components[i]).val(),
          title_selector: $('.title-selector', components[i]).val(),
          title_attribute: $('.title-attribute', components[i]).val(),
          target_selector: $('.target-selector', components[i]).val(),
          target_attribute: $('.target-attribute', components[i]).val(),
          image_selector: $('.image-selector', components[i]).val(),
          image_attribute: $('.image-attribute', components[i]).val(),
          score_selector: $('.score-selector', components[i]).val(),
          score_attribute: $('.score-attribute', components[i]).val()
        });
      }

      return attrs;
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

    saveSuccessCallback: function(data, status) {
      window.location = '/channel/edit/' + data._id;
    },

    saveErrorCallback: function(xhr, status, error) {
      alert('Error saving the channel!');
    }
  }

  $(document).ready(function() {
    ChannelFormController.init();
  });

});
