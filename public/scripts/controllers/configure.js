require([
  "pagetty",
  "text!templates/rule.html",
  "icanhaz",
  "/highlight/highlight.pack.js",
], function(Pagetty, ruleTemplate) {

require();

Controller = {
  init: function() {
    var self = this;

    ich.addTemplate("rule", ruleTemplate);

    $(".btn-save").click(function() {
      $.ajax("/configure", {
        type: "POST",
        data: self.getData(),
        success: self.saveSuccessCallback,
        error: self.saveErrorCallback
      });
    });

    $(".btn-unsubscribe").click(function() {
      $.ajax("/unsubscribe", {
        type: "POST",
        data: {channel_id: channel_id},
        success: self.unsubscribeSuccessCallback,
        error: self.unsubscribeErrorCallback
      });
    });

    $('.btn-add-rule').click(function() {
      $('#rules').append(ich.rule());
    });

    $('.btn-remove-rule').live('click', function(e) {
      if (confirm("Are you sure? This will affect all channels on this domain.")) {
        $(this).parent().parent().remove();
      }
      return false;
    });

    $('.btn-generate').live("click", function() {
      var rule = $(this).parents(".rule");

      $.ajax("/api/configure/generate/" + channel_id + "/" + rule.find("input.generate").val())
        .done(function(data) {
          if (confirm("Overwrite existing fields?")) {
            rule.find("input.item").val(data);
            rule.find("input.target-selector").val("a");
            rule.find("input.target-url-attribute").val("href");
            rule.find("input.image-selector").val("img");
            rule.find("input.image-attribute").val("src");
          }
        })
        .error(function() {
          alert("Link could not be found. Try another one.");
        });
    });

    $('.btn-fetch-sample').live("click", function() {
      var rule = $(this).parents(".rule");
      rule.find(".sample").html("<img src=\"/images/loading.gif\" />").show();

      $.ajax("/api/configure/sample/" + channel_id + "/" + encodeURIComponent(rule.find("input.item").val())).done(function(data) {
        rule.find(".sample").html("<pre><code>" + data + "</code></pre>");
        rule.find(".sample pre code").each(function(i, e) {hljs.highlightBlock(e)});
      });
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
    window.location = "/channel/" + channel_id;
  },
  saveErrorCallback: function(xhr, status, error) {
    alert(xhr.responseText);
  },
  unsubscribeSuccessCallback: function(data, status) {
    window.location = "/";
  },
  unsubscribeErrorCallback: function(xhr, status, error) {
    console.dir(xhr);
    alert(xhr.responseText);
  }
};

$(document).ready(function() {
  Controller.init();
});

});
