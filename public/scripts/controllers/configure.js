require([
  "pagetty",
  "text!templates/rule.html",
  "icanhaz"
], function(Pagetty, ruleTemplate) {

Controller = {
  init: function() {
    var self = this;

    ich.addTemplate("rule", ruleTemplate);

    $(".btn-save").click(function(e) {
      console.dir(self.getData());

      $.ajax("/configure", {
        type: "POST",
        data: self.getData(),
        success: self.saveSuccessCallback,
        error: self.saveErrorCallback
      });
    });

    $('.btn-add-rule').click(function() {
      $('#rules').append(ich.rule());
    });

    $('.btn-remove-rule').live('click', function(e) {
      $(this).parent().remove();
      return false;
    });
  },
  getData: function() {
    var attrs = {
      _id: channel_id,
      name: $("#subscription input.name").val(),
      rules: []
    };

    var rules = $("#rules .rule").get();

    for (var i in rules) {
      attrs.rules.push({
        item: $("input.item", rules[i]).val(),
        target: {
          selector: $("input.target-selector", rules[i]).val(),
          url_attribute: $("input.target-url-attribute", rules[i]).val(),
          title_attribute: $("input.target-title-attribute", rules[i]).val()
        },
        image: {
          selector: $(".image-selector", rules[i]).val(),
          attribute: $(".image-attribute", rules[i]).val()
        },
        score: {
          selector: $(".score-selector", rules[i]).val(),
          attribute: $(".score-attribute", rules[i]).val(),
        },
        comments: {
          selector: $(".comments-selector", rules[i]).val(),
          attribute: $(".comments-attribute", rules[i]).val(),
        },
      });
    }

    return attrs;
  },
  saveSuccessCallback: function(data, status) {
    window.location = "/#" + channel_id;
  },
  saveErrorCallback: function(xhr, status, error) {
    alert(xhr.responseText);
  }
};

$(document).ready(function() {
  Controller.init();
});

});
