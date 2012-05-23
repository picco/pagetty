/*
define([
  'text!templates/channel_item.html',
  'text!templates/channel.html',
  'text!templates/channel_all.html',
  'icanhaz',
  'jquery.timeago',
  'underscore',
  'jquery.history',
  'moment'
],function(channelItemTemplate, channelTemplate, channelAllTemplate) {
});
*/

var pagetty = {
    channels: {},
    subscriptions: {},
    activeChannel: false,
    activeVariant: false,
    pager: 9,
    state: {channels: {}},
    updates: [],

    init: function(user, channels) {
      var self = this;
      this.user = user;
      this.subscriptions = user.subscriptions;

      ich.addTemplate("channelItem", channelItemTemplate);
      ich.addTemplate("channel", channelTemplate);
      ich.addTemplate("channelAll", channelAllTemplate);

      for (var i in channels) {
        this.channels[channels[i]._id] = channels[i];
        $("#channels .list").append('<li class="channel channel-' + channels[i]._id + '"><a href="#' + channels[i]._id + '" data-channel="' + channels[i]._id + '">' + this.subscriptions[channels[i]._id].name + '</a></li>');
      }

      for (i in this.channels) {
        this.state.channels[this.channels[i]._id] = this.channels[i].items_added;
      }

      $("#channels li.channel a").bind("click", function() {
        var channel = $(this).data("channel"), variant = $(this).data("variant");
        History.pushState({channel: channel, variant: variant}, null, self.channelUrl(channel, variant));
        self.showChannel($(this).data("channel"), $(this).data("variant"));
        return false;
      });

      $(".channel a.variant").live("click", function() {
        var channel = $(this).data("channel"), variant = $(this).data("variant");
        History.pushState({channel: channel, variant: variant}, null, self.channelUrl(channel, variant));
        self.showChannel($(this).data("channel"), $(this).data("variant"));
        return false;
      });

      $(".channel .more").live("click", function() {
        self.loadMore(this.activeChannel);
        return false;
      });

      $(".new-stories").live("click", function(e) {
        e.preventDefault();
        self.refreshChannels();
        return false;
      });

      $("#add-subscription .btn-subscribe").click(function() {
        self.clearMessages();

        $.ajax("/subscribe", {
          type: "POST",
          data: {url: $(".subscribe-url").val()},
          success: function(data) {
            window.location = "/configure/" + data.channel_id;
          },
          error: function(xhr, status, error) {
            self.error(xhr.responseText, "subscribe-messages");
          }
        });
      });

      // Sidebar scroll

      $("aside").niceScroll({scrollspeed: 1, mousescrollstep: 40, cursorcolor: "#fafafa", cursorborder: "none", zindex: 1});

      // Act on popstate

      History.Adapter.bind(window, "statechange", function() {
        var stateData = History.getState().data;

        if (stateData.channel) {
          self.showChannel(stateData.channel, stateData.variant);
        }
      });

      // Lazy load additional stories when the page is scrolled near to the bottom.

      $(window).scroll(function() {
        if ($(window).scrollTop() + $(window).height() >= $(document).height() - 60) {
          if ($(window).width() > 960) self.loadMore();
        }
      });

      // Auto-update channels.

      window.setInterval(function() {
        self.updateChannels();
      }, 10000);

      // Open a requested channel.

      var path = window.location.pathname.split("/"), channel = "all", variant;

      if (path[1] == "channel") {
        if (path.length == 3) {
          channel = path[2];
        }
        else if (path.length == 4) {
          channel = path[2];
          variant = path[3];
        }
      }

      if (channel == "all" || self.channels[channel]) {
        self.showChannel(channel, variant);
        History.pushState({channel: channel, variant: variant}, null, this.channelUrl(channel, variant));
      }
      else {
        window.location = "/";
      }

      // Reveal the UI when everything is loaded.
      $(".app .container").show();

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
        items[i].created = moment(items[i].created);
        items[i].stamp = moment(items[i].created).format();
        items[i].score = parseInt(items[i].score) ?  this.formatScore(items[i].score) : false;
        items[i].visible = (i <= this.pager) ? true : false;
        items[i].className = items[i].visible ? "show" : "hide";
        if (items[i].isnew) items[i].className += " new";
        if (items[i].id && items[i].image) items[i].image_url = "/images/" + items[i].id + ".jpg";

        // Reduce long channel names
        if (items[i].channel.name.length > 30) {
          items[i].channel.name = items[i].channel.name.substr(0, 30) + "...";
        }

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
      var html = "", self = this, channel = this.channels[channel_id], subscription = this.subscriptions[channel_id];

      if (!variant) {
        variant = channel_id == "all" ? "time" : "original";
      }

      $("#channels .list li.channel-" + channel_id).addClass("loading");

      if (channel_id == "all") {
        html = self.renderItems(self.sortItems(self.aggregateAllItems(), variant));
      }
      else {
        if ($.isArray(self.channels[channel_id].items) && self.channels[channel_id].items.length) {
          for (i in self.channels[channel_id].items) {
            self.channels[channel_id].items[i].channel = {name: self.subscriptions[channel_id].name, url: self.channels[channel_id].url};
          }
          html = self.renderItems(self.sortItems(self.channels[channel_id].items, variant));
        }
      }

      $('.runway .channel').remove();

      if (channel_id == "all") {
        $(".runway .inner").append(ich.channelAll({channel: channel, subscription: {name: "All stories"}, items: html}));
      }
      else {
        $(".runway .inner").append(ich.channel({channel: channel, subscription: subscription, items: html}));
      }

      $(".runway .channel-" + channel_id + " abbr.timeago").timeago();
      $('#channels .list li, a.variant').removeClass('active');
      $('#channels .list li.channel-' + channel_id + ", a.variant." + channel_id + "-" + variant).addClass('active');

      if (self.newItems) self.showUpdateNotification();

      $(".channel-" + channel_id + " .items .show img").each(function(index, element) {
        var img = new Image();
        var original = this;

        $(img)
          .load(function () {
            $(original).replaceWith(img);
          })
          .error(function () {
            delete img;
            $(original).parent().remove();
          })
          .attr('src', $(original).data("src"));
      });

      // Add "Load more" button.

      var selection = $(".channel-" + channel_id + " .items .hide");

      if (selection.size()) {
        $(".runway .channel-" + channel_id).append('<a class="more" href="#"><i class="icon-arrow-down"></i> Show more stories</a></div>');
      }

      self.activeChannel = channel_id;
      self.activeVariant = variant;

      window.scrollTo(0, 0);

      $("#channels .list li.channel-" + channel_id).removeClass("loading");

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
        if (updates.length) {
          $.each(updates, function(index, value) {
            self.state.channels[value._id] = value.items_added;
            self.updates[value._id] = value.items;
            self.newItems = true;
            self.showUpdateNotification();
          });
        }
      });
    },
    refreshChannels: function() {
      for (var channel_id in this.channels) {
        for (var i in this.channels[channel_id].items) {
          this.channels[channel_id].items[i].isnew = false;
        }
      }

      for (var channel_id in this.updates) {
        for (var i in this.updates[channel_id]) {
          this.updates[channel_id][i].isnew = this.itemIsNew(channel_id, this.updates[channel_id][i]);
        }
        this.channels[channel_id].items = this.updates[channel_id];
      }

      this.newItems = false;
      this.updates = [];
      this.showChannel("all", "time");
      History.pushState({channel: "all", variant: "time"}, null, this.channelUrl("all", "time"));
      this.hideUpdateNotification();
    },
    showUpdateNotification: function() {
      $(".app .runway").addClass("with-messages");
      $(".channel .messages").html('<a class="new-stories" href="#"><i class="icon-refresh"></i> New stories available. Click here to update.</a>');
    },
    hideUpdateNotification: function() {
      $(".app .runway").removeClass("with-messages");
      $(".channel .messages").html();
    },
    itemIsNew: function(channel_id, item) {
      for (var j in this.channels[channel_id].items) {
        if (this.channels[channel_id].items[j].id == item.id) {
          return false;
        }
      }
      return true;
    },
    loadMore: function() {
      var selection = $(".channel-" + this.activeChannel + " .items .hide");

      if (selection.length) {
        selection.slice(0, this.pager + 1).each(function(index, element) {
          $(this).removeClass("hide").addClass("show");
          var image = $(this).find("img").first();
          image.attr("src", image.data("src"));
        });
      }
      else {
        $(".channel-" + this.activeChannel + " .more").html("You have reached the end :)");
      }
    },
    channelList: function() {
      var list = {all: "All stories"};

      for (var i in this.channels) {
        list[this.channels[i]._id] = this.subscriptions[i].name;
      }

      return list;
    },
    channelUrl: function(channelId, variant) {
      if (channelId == "all") {
        if (!variant || variant == "time") {
          return "/"
        }
        else {
          return "/channel/all/" + variant;
        }
      }
      else {
        return "/channel/" + channelId + ((!variant || variant == "original") ? "" : ("/" + variant));
      }
    },
    error: function(text, container) {
      $("#" + container).html("<div class=\"alert alert-error\">" + text + "</div>");
    },
    clearMessages: function() {
      $(".messages").html("");
    }
  };