require([
  "pagetty",
  "text!templates/rule.html",
  "icanhaz",
  "/highlight/highlight.pack.js",
], function(pagetty, ruleTemplate) {

Controller = {
  init: function() {
    var self = this;

    ich.addTemplate("rule", ruleTemplate);

    if (window.location.href.match(/empty/)) $('#emptyModal').modal({show: true});

    $(".btn-save-subscription").click(self.saveSubscription);

    $("#subscription .name").keypress(function(e) {
      if (e.keyCode == 13) self.saveSubscription();
    });

    $(".btn-unsubscribe").click(function() {
      $.ajax("/unsubscribe", {
        type: "POST",
        data: {channel_id: channel_id},
        success: function(data, status) {
          window.location = "/";
        },
        error: function(xhr, status, error) {
          pagetty.error(xhr.responseText);
        }
      });
    });

    $(".btn-save-rules").click(function() {
      $.ajax("/rules", {
        type: "POST",
        data: self.getRulesData(),
        success: function(data, status) {
          pagetty.success('Changes saved.', 'rules-messages');
        },
        error: function(xhr, status, error) {
          pagetty.error(xhr.responseText, 'rules-messages');
        },
      });
    });

    $('.btn-add-rule').click(function() {
      $('#rules').append(ich.rule());
    });

    $('.btn-remove-rule').live('click', function(e) {
      $(this).parent().parent().remove();
      return false;
    });

    $('.btn-fetch-sample').live("click", function() {
      var rule = $(this).parents(".rule");
      rule.find(".sample").html("<img src=\"/images/loading.gif\" />").show();

      $.ajax("/api/configure/sample/" + channel_id + "/" + encodeURIComponent(rule.find("input.item").val())).done(function(data) {
        rule.find(".sample").html("<pre><code>" + data + "</code></pre>");
        rule.find(".sample pre code").each(function(i, e) {hljs.highlightBlock(e)});
      });
    });

    $('.btn-add-to-channel').live("click", function() {
      var data = {
        channel_id: channel_id,
        rule: {
          item: $(this).data('item-selector'),
          target: {selector: $(this).data('target-selector'), url_attribute: $(this).data('target-url'), title_attribute: $(this).data('target-title')},
          image: {selector: $(this).data('image-selector'), attribute: $(this).data('image-attribute')},
          comments: {selector: $(this).data('comments-selector'), attribute: $(this).data('comments-attribute')},
          score: {selector: $(this).data('score-selector'), attribute: $(this).data('score-attribute')},
        },
      };

      $.ajax({
        type: 'POST',
        url: '/rule/create',
        data: data,
        success: function() {
          window.location = '/channel/' + channel_id + '/configure';
        },
        error: function() {
          alert('Error occurred.')
        },
      });

      return false;
    });

    $('.btn-remove-from-channel').live("click", function() {
      $.ajax({
        type: 'POST',
        url: '/rule/delete',
        data: {channel_id: channel_id, rule_id: $(this).data('rule')},
        success: function() {
          window.location = '/channel/' + channel_id + '/configure';
        },
        error: function() {
          alert('Error occurred.')
        },
      });

      return false;
    });
  },
  saveSubscription: function() {
    $.ajax("/subscription", {
      type: "POST",
      data: {channel_id: channel_id, name: $("#subscription .name").val()},
      success: function(data, status) {
        pagetty.success('Changes saved.');
      },
      error: function(xhr, status, error) {
        pagetty.error(xhr.responseText);
      }
    });
  },
  getRulesData: function() {
    var attrs = {
      channel_id: channel_id,
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
};

$(document).ready(function() {
  Controller.init();
});

});
