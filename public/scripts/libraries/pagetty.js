define([
  'text!templates/channel_item.html',
  'text!templates/channel.html',
  'text!templates/channel_all.html',
  'icanhaz',
  'timeago',
  'underscore'
],function(channelItemTemplate, channelTemplate, channelAllTemplate) {
  var Pagetty = {
    channels: {},
    subscriptions: {},
    activeChannel: false,
    activeVariant: false,
    pager: 9,
    state: {channels: {}},
    updates: {},
    rendered: [],

    init: function(user, channels) {
      var self = this;
      this.user = user;

      this.subscriptions = user.subscriptions;

      for (var i in channels) {
        // Store channels as object with chanannel id's as keys.
        this.channels[channels[i]._id] = channels[i];
        // Create channel navigation links.
        $("#channels .list").append('<li class="channel channel-' + channels[i]._id + '"><a href="#' + channels[i]._id + '" data-channel="' + channels[i]._id + '">' + this.subscriptions[channels[i]._id].name + '</a></li>');
      }

      ich.addTemplate("channelItem", channelItemTemplate);
      ich.addTemplate("channel", channelTemplate);
      ich.addTemplate("channelAll", channelAllTemplate);

      for (i in this.channels) {
        this.state.channels[this.channels[i]._id] = this.channels[i].items_added;
      }

      $(".runway .more a").click(function() {
        self.loadMore($(this).data("channel"));
        return false;
      });

      return this;
    },
    sortItems: function(items_reference, variant) {
      var items = _.clone(items_reference);

      if (variant == "time") {
        return items.sort(function(a, b) {
          var a = new Date(a.created);
          var b = new Date(b.created);

          return b.getTime() - a.getTime();
        });
      }
      else if (variant == "score") {
        return items.sort(function(a, b) {
          return parseFloat(b.relative_score) - parseFloat(a.relative_score);
        });
      }
      else {
        return items;
      }
    },
    aggregateAllItems: function() {
      var items = [];

      for (i in this.channels) {
        for (j in this.channels[i].items) {
          var item = this.channels[i].items[j];
          item.channel = {name: this.subscriptions[i].name, url: this.channels[i].url};
          items.push(item);
        }
      }

      return items;
    },
    renderItems: function(items) {
      var html = "";

      for (var i in items) {
        items[i].stamp = this.ISODateString(new Date(items[i].created));
        items[i].score = this.formatScore(items[i].score);
        items[i].visible = (i <= this.pager) ? true : false;
        items[i].class = items[i].visible ? "show" : "hide";
        if (items[i].isnew) items[i].class += " new";
        if (items[i].id && items[i].image) items[i].image_url = "/images/" + items[i].id + ".jpg";
        html += ich.channelItem(items[i], true);
      }

      return html;
    },
    formatScore: function(nStr) {
      nStr += '';
      x = nStr.split('.');
      x1 = x[0];
      x2 = x.length > 1 ? '.' + x[1] : '';
      var rgx = /(\d+)(\d{3})/;
      while (rgx.test(x1)) {
        x1 = x1.replace(rgx, '$1' + ' ' + '$2');
      }
      return x1 + x2;
    },
    showChannel: function(channel_id, variant) {
      var channel = this.channels[channel_id];
      var subscription = this.subscriptions[channel_id];
      var html = '';

      if (!variant) {
        variant = channel_id == "all" ? "time" : "original";
      }

      if (channel_id == "all") {
        html = this.renderItems(this.sortItems(this.aggregateAllItems(), variant));
      }
      else {
        if ($.isArray(this.channels[channel_id].items) && this.channels[channel_id].items.length) {
          for (i in this.channels[channel_id].items) {
            this.channels[channel_id].items[i].channel = {name: this.subscriptions[channel_id].name, url: this.channels[channel_id].url};
          }
          html = this.renderItems(this.sortItems(this.channels[channel_id].items, variant));
        }
      }

      $('.runway .channel').remove();

      if (channel_id == "all") {
        $(".runway").append(ich.channelAll({channel: channel, subscription: {name: "All stories"}, items: html}));
      }
      else {
        $(".runway").append(ich.channel({channel: channel, subscription: subscription, items: html}));
      }

      $(".runway .channel-" + channel_id + " abbr.timeago").timeago();
      $('#channels .list li, a.channel-variant').removeClass('active');
      $('#channels .list li.channel-' + channel_id + ", a.channel-variant." + channel_id + "-" + variant).addClass('active');

      $(".channel-" + channel_id + " .items .show img").each(function(index, element) {
        var img = new Image();
        var original = this;

        $(img)
          .load(function () {
            $(original).replaceWith(img);
          })
          .error(function () {
            delete img;
            $(original).parent().parent().remove();
          })
          .attr('src', $(original).data("src"));
      });

      // Add "Load more" button.

      var selection = $(".channel-" + channel_id + " .items .hide");

      if (selection.size()) {
        $(".runway .channel-" + channel_id).append('<div class="more"><a href="#" class="button" data-channel="' + channel_id + '">Show more stories</a></div>');
      }

      this.activeChannel = channel_id;
      this.activeVariant = variant;
      this.updateUI();

      return false;
    },
    ISODateString: function(d) {
      function pad(n){return n<10 ? '0'+n : n}
      return d.getUTCFullYear()+'-'
        + pad(d.getUTCMonth()+1)+'-'
        + pad(d.getUTCDate())+'T'
        + pad(d.getUTCHours())+':'
        + pad(d.getUTCMinutes())+':'
        + pad(d.getUTCSeconds())+'Z'
    },
    updateChannels: function() {
      var self = this;

      $.getJSON('/update', {state: this.state}, function(updates) {
        $.each(updates, function(index, value) {
          self.state.channels[value._id] = value.items_added;
          self.updates[value._id] = value.items;
          self.showUpdateNotification();
        });
      });
    },
    showUpdateNotification: function() {
      $('#refresh').show();
    },
    hideUpdateNotification: function() {
      $('#refresh').hide();
    },
    refreshChannels: function() {
      for (var channel_id in this.channels) {
        for (var i in this.channels[channel_id]) {
          this.channels[channel_id][i].isnew = false;
        }
      }

      for (var channel_id in this.updates) {
        for (var i in this.updates[channel_id]) {
          this.updates[channel_id][i].isnew = this.itemIsNew(channel_id, this.updates[channel_id][i]);
        }
        this.channels[channel_id].items = this.updates[channel_id];
      }

      this.updates = [];
      this.showChannel("all", "time");
      this.hideUpdateNotification();
    },
    itemIsNew: function(channel_id, item) {
      for (var i in this.channels[channel_id]) {
        if (this.channels[channel_id][i]._id == item._id) return false;
      }
      return true;
    },
    loadMore: function(channel_id) {
      var selection = $(".channel-" + channel_id + " .items .hide");

      if (selection.length) {
        selection.slice(0, this.pager + 1).each(function(index, element) {
          $(this).removeClass("hide").addClass("show");
          var image = $(this).find("img").first();
          image.attr("src", image.data("src"));
        });
      }
      else {
        $(".channel-" + channel_id + " .more").html("You have reached the end :)");
      }
    },
    autoload: function() {
      this.loadMore(this.activeChannel);
    },
    updateUI: function() {
    },
    channelList: function() {
      var list = {all: "All stories"};

      for (var i in this.channels) {
        list[this.channels[i]._id] = this.subscriptions[i].name;
      }

      return list;
    },
    error: function(text, container) {
      $("#" + container).html("<div class=\"alert alert-error\">" + text + "</div>");
      // <a class=\"close\" data-dismiss=\"alert\" href=\"#\">&times;</a>
    },
    clearMessages: function() {
      $(".messages").html("");
    }
  }
  return Pagetty;
});