require([
  "pagetty",
  "/highlight/highlight.pack.js",
], function(pagetty) {

Controller = {
  init: function() {
    var self = this;

    $(".btn-save-list").click(self.saveList);

    $("#list .name").keypress(function(e) {
      if (e.keyCode == 13) self.saveList();
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
      pagetty.showProgress();

      $.ajax("/rule", {
        type: "POST",
        data: self.getRulesData(),
        success: function(data, status) {
          pagetty.success("Rules are saved and the feed has been updated.");
        },
        error: function(xhr, status, error) {
          pagetty.error(xhr.responseText);
        },
      });

      return false;
    });

    $('.btn-fetch-sample').live("click", function() {
      var rule = $(this).parents(".rule");
      rule.find(".sample").html("<img src=\"/images/loading.gif\" />").show();

      $.ajax("/api/channel/sample/" + channel_id + "/" + encodeURIComponent(rule.find("input.item").val())).done(function(data) {
        rule.find(".sample").html("<pre><code>" + data + "</code></pre>");
        rule.find(".sample pre code").each(function(i, e) {hljs.highlightBlock(e)});
      });
    });
  },
  saveList: function() {
    pagetty.showProgress();

    $.ajax("/list", {
      type: "POST",
      data: {list_id: list_id, name: $("#list .name").val()},
      success: function(data, status) {
        pagetty.success('Changes saved.');
      },
      error: function(xhr, status, error) {
        pagetty.error(xhr.responseText);
      }
    });
  },
  getRulesData: function() {
    var data = {
      channel_id: channel_id,
      rule: {
        item: $("input.item").val(),
        target: {
          selector: $("input.target-selector").val(),
          attribute: $("input.target-attribute").val(),
        },
        title: {
          selector: $("input.title-selector").val(),
          attribute: $("input.title-attribute").val(),
        },
        image: {
          selector: $(".image-selector").val(),
          attribute: $(".image-attribute").val(),
        },
        score: {
          selector: $(".score-selector").val(),
          attribute: $(".score-attribute").val(),
        },
        comments: {
          selector: $(".comments-selector").val(),
          attribute: $(".comments-attribute").val(),
        },
      }
    };

    return data;
  },
};

$(document).ready(function() {
  Controller.init();
});

});
