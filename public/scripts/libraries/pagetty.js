define([
  "text!templates/channel_item.html",
  "text!templates/channel.html",
  "text!templates/channel_all.html",
  "underscore",
  "nicescroll",
  "icanhaz",
  "timeago",
  "history",
  "moment",
],function(channelItemTemplate, channelTemplate, channelAllTemplate) {

  var Pagetty = {
    activeChannel: false,
    activeTitle: false,
    activeVariant: false,
    activeItems: [],
    pager: 19,

    init: function(user, channels, state) {
      var self = this;

      // User information.
      this.user = user;
      // Channel information.
      this.channels = channels;
      // State information (news items).
      this.state = state;
      // New state information.
      this.new_state = null;
      // Prepared navigation data.
      this.navigation = [];
      // All items aggregated from current state.
      this.all_items = [];
      // All items aggregated from new state.
      this.new_all_items = [];

      // Initialize theme.
      ich.addTemplate("channelItem", channelItemTemplate);
      ich.addTemplate("channel", channelTemplate);
      ich.addTemplate("channelAll", channelAllTemplate);

      // Pagetty

      for (channel_id in this.user.subscriptions) {
        this.navigation.push({channel_id: channel_id, name: this.user.subscriptions[channel_id].name});
      }

      this.navigation.sort(function(a, b) {
        var x = a.name.toLowerCase(), y = b.name.toLowerCase();
        return ( ( x == y ) ? 0 : ( ( x > y ) ? 1 : -1 ) );
      });

      for (var i in this.navigation) {
        $("#channels .list").append('<li class="channel channel-' + this.navigation[i].channel_id + '"><a href="/channel/' + this.navigation[i].channel_id + '" data-channel="' + this.navigation[i].channel_id + '">' + _.escape(this.navigation[i].name) + ' <span class="new-count pull-right"></span></a></li>');
      }

      // Calculate nav height;

      $('#channels .list').css('max-height', ($(window).height() - 140) + 'px');

      $(window).resize(function() {
        $('#channels .list').css('max-height', ($(window).height() - 140) + 'px');
      });

      $("#channels .nav-list .channel a").on("click", function(e) {
        e.preventDefault();

        var channel = $(this).data("channel"), variant = $(this).data("variant");

        if (self.activeChannel == channel) {
          self.showChannel(channel, variant);
        }
        else {
          History.pushState({page: "channel", channel: channel, variant: variant}, null, self.channelUrl(channel, variant));
        }
      });

      // Act on statechange.

      History.Adapter.bind(window, "statechange", function() {
        var stateData = History.getState().data;

        if (stateData.page == "channel") {
          self.showChannel(stateData.channel, stateData.variant);
        }

      });

      // Sidebar scroll

      window.setTimeout(function() {
        $("#channels .list").niceScroll({scrollspeed: 1, mousescrollstep: 40, cursorcolor: "#fafafa", cursorborder: "none", zindex: 1});
      }, 1000);

      // Load more on scroll.

      $(window).scroll(function() {
        if ($(window).scrollTop() + $(window).height() >= $(document).height() - 300) {
          self.loadItems(self.activeChannel, self.activeVariant);
        }
      });

      $(document).keydown(function(e) {
        if (e.ctrlKey == false && e.altKey == false && e.shiftKey == false) {
          if (e.keyCode == 37) {
            self.openPrevChannel();
            return false;
          }
          else if (e.keyCode == 39) {
            self.openNextChannel();
            return false;
          }
        }
      });

      // Run the application.
      this.runApp();

      // Auto-update channels every minute.
      window.setTimeout(function() { self.updateChannels(); }, 500)
      window.setInterval(function() { self.updateChannels(); }, 60000);
    },
    runApp: function() {
      var self = this;

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

      this.all_items = self.aggregateAllItems(this.state);

      if (channel == "all" || self.channels[channel]) {
        this.showChannel(channel, variant);
      }
      else {
        window.location = "/";
      }

      // Reveal the UI when everything is loaded.
      $(".app-loading").hide();
      $(".app .container").show();
    },
    showChannel: function(channel_id, variant) {
      var self = this;
      var items = [];
      var html = "";
      var selector = "";
      var messages = {};

      if (!variant) {
        variant = channel_id == "all" ? "time" : "original";
      }

      this.activeChannel = channel_id;
      this.activeVariant = variant;
      this.activeTitle = this.activeChannel == "all" ? "All stories" : this.user.subscriptions[channel_id].name;

      // Reusable selector for this channel: .channel-id-variant
      selector = ".channel-" + channel_id + "-" + variant;

      $('.runway .channel').remove();

      if (channel_id == "all") {
        this.activeItems = self.sortItems(this.all_items, variant);
      }
      else {
        if (!_.isUndefined(self.state.channels[channel_id]) && $.isArray(self.state.channels[channel_id].items) && self.state.channels[channel_id].items.length) {
          items = _.clone(self.state.channels[channel_id].items);

          for (i in items) {
            items[i].channel = {id: channel_id, name: self.user.subscriptions[channel_id].name, url: self.channels[channel_id].url};
          }

          this.activeItems = self.sortItems(items, variant);
        }
      }

      if (channel_id == "all") {
        $(".runway .inner").html(ich.channelAll({
          variant: variant,
          subscription: {name: "All stories"},
          nav: self.navigation,
          count: this.activeItems.length,
          user: self.user
        }));
      }
      else {
        $(".runway .inner").html(ich.channel({
          channel: self.channels[channel_id],
          variant: variant,
          subscription: self.user.subscriptions[channel_id],
          nav: self.navigation,
          count: this.activeItems.length,
          user: self.user
        }));
      }

      self.loadItems(this.activeChannel, this.activeVariant);

      if (this.new_state && this.new_state.new_items) {
        $(".app .runway").addClass("with-messages");
      }

      // Add active classes to channel navigation links.

      $('li.channel-' + channel_id).addClass('active');
      $('li.channel, a.variant').removeClass('active');
      $('li.channel-' + channel_id + ", a.variant." + channel_id + "-" + variant).addClass('active');

      $('.toggle-channel-nav').removeClass('open');
      $('.channel-nav').addClass('hide');
      $('.channel .items').removeClass('hide');

      // Bindings

      $(selector + " a.variant").on("click", function() {
        var channel = $(this).data("channel"), variant = $(this).data("variant");
        History.pushState({page: "channel", channel: channel, variant: variant}, null, self.channelUrl(channel, variant));
        return false;
      });

      $(selector + " .item .site a").on("click", function(e) {
        var channel = $(this).data("channel");

        if (self.activeChannel == channel) {
          return true;
        }
        else {
          History.pushState({page: "channel", channel: channel, variant: 'original'}, null, self.channelUrl(channel, 'original'));
          return false;
        }
      });

      $(selector + " .new-stories, " + selector + " .refresh").on("click", function(e) {
        self.refreshChannels();
        e.preventDefault();
      });

      $(selector + ' .toggle-channel-nav').on('click', function(e) {
        var selector = '.channel-' + self.activeChannel + '-' + self.activeVariant;

        $(selector + ' .channel-nav').addClass('hide');

        if ($(this).hasClass('open')) {
          $(this).removeClass('open');
          $(selector + ' .items').removeClass('hide');
        }
        else {
          $(this).addClass('open');
          $(selector + ' .items').addClass('hide');
          $(selector + ' .channel-nav').removeClass('hide');
        }

        e.preventDefault();
        window.scrollTo(0, 0);

      });

      $(selector + ".app .logo, " + selector + " .app .mobile-logo").on("click", function(e) {
        if (self.activeChannel != 'all') {
          var channel = 'all', variant = 'time';
          History.pushState({page: 'channel', channel: channel, variant: variant}, null, self.channelUrl(channel, variant));
          e.preventDefault();
        }
      });

      $(selector + " .nav-list .channel a").on("click", function(e) {
        e.preventDefault();

        var channel = $(this).data("channel"), variant = $(this).data("variant");

        if (self.activeChannel == channel) {
          self.showChannel(channel, variant);
        }
        else {
          History.pushState({page: "channel", channel: channel, variant: variant}, null, self.channelUrl(channel, variant));
        }
      });

      $(selector + ' .next-channel').on("click", function() {
        self.openNextChannel.call(self);
        return false;
      });

      $(selector + ' .prev-channel').on("click", function() {
        self.openPrevChannel.call(self);
        return false;
      });

      $(selector + ' .up').on("click", function() {
        window.scrollTo(0, 0);
        return false;
      });

      self.updateCounts();
      self.showUpdateNotification();
      window.scrollTo(0, 0);

      return false;
    },
    aggregateAllItems: function(source) {
      var items = [];

      for (i in source.channels) {
        for (j in source.channels[i].items) {
          var item = _.clone(source.channels[i].items[j]);
          item.channel = {id: this.channels[i]._id, name: this.user.subscriptions[i].name, url: this.channels[i].url};
          items.push(item);
        }
      }

      return items;
    },
    sortItems: function(items_reference, variant) {
      var items = _.clone(items_reference);

      if (variant == "time") {
        return items.sort(function(a, b) {
          return b.created - a.created;
        });
      }
      else if (variant == "score") {
        return items.sort(function(a, b) {
          if (a.relative_score == b.relative_score) {
            return b.created - a.created;
          }
          else {
            return parseFloat(b.relative_score) - parseFloat(a.relative_score);
          }
        });
      }
      else {
        var items_new = [];
        var items_old = [];

        for (var i in items) {
          if (items[i].isnew) {
            items_new.push(items[i]);
          }
          else {
            items_old.push(items[i]);
          }
        }

        return items_new.concat(items_old);
      }
    },
    renderItems: function(items) {
      var html = '', item = {}, j = 0;

      for (var i in items) {
        item = _.clone(items[i]);

        item.stamp = moment(item.created).format();
        item.score = parseInt(item.score) ?  this.formatScore(item.score) : false;
        item.className = 'item-short item-without-image hide';

        if (item.isnew) item.className += ' new';

        if (item.id && item.image) {
          item.image_url = '/imagecache/' + item.id + '-' + item.image_hash + '.jpg';
        }

        // Reduce long channel names
        if (item.channel.name.length > 40) {
          item.channel.name = item.channel.name.substr(0, 40) + '...';
        }

        html += ich.channelItem(item, true);
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
    showUpdateNotification: function() {
      if (this.new_state && this.new_state.new_items > 0) {
        $('.app .runway').addClass("with-messages");
        $('.channel .messages .count').text(this.new_state.new_items);
        $('.channel .messages .lbl').text(this.new_state.new_items == 1 ? 'new story' : 'new stories');
        $('.channel .messages').show();

        // Mobile.
        $('.new-items-count').html(this.new_state.new_items);
        $('.refresh').show();
        this.updateTitle();
      }
    },
    hideUpdateNotification: function() {
      this.updateNotificationActive = false;
      $(".app .runway").removeClass("with-messages");
      $(".channel .messages").hide();
      $('.refresh').hide();
      this.updateTitle();
    },
    updateTitle: function() {
      if (this.new_items && this.new_state.new_items) {
        document.title = "(" + this.new_state.new_items + ") " + this.activeTitle + " - Pagetty";
      }
      else {
        document.title = this.activeTitle + " - Pagetty";
      }
    },
    updateChannels: function() {
      var self = this;

      $.getJSON("/api/state/new/" + (self.new_state ? self.new_state.stamp : 0), function(state) {
        if (state) {
          self.new_state = state;
          self.new_all_items = self.aggregateAllItems(self.new_state);
          self.showUpdateNotification();
        }
      }).error(function(xhr, status, error) {
        // The session has timed out.
        if (xhr.status == 403) window.location.href = '/';
      });
    },
    refreshChannels: function() {
      var self = this;
      var stateData = History.getState().data;

      self.showProgress();

      $.get("/api/state/refresh");

      self.state = self.new_state;
      self.new_state = null;
      self.all_items = self.new_all_items;
      self.new_all_items = [];

      self.hideUpdateNotification();

      if (stateData.page == "channel" && stateData.channel == "all" && stateData.variant == "time") {
        self.showChannel("all", "time");
      }
      else {
        History.pushState({page: "channel", channel: "all", variant: "time"}, null, self.channelUrl("all", "time"));
      }

      self.hideProgress();
    },
    updateCounts: function() {
      var total_new_count = 0;

      for (channel_id in this.user.subscriptions) {
        var new_count = 0;

        if (this.state.channels[channel_id] && this.state.channels[channel_id].items) {
          for (var i in this.state.channels[channel_id].items) {
            if (this.state.channels[channel_id].items[i].isnew) {
              new_count++;
              total_new_count++;
            }
          }
        }

        $('.channel-' + channel_id + ' .new-count').text(new_count ? new_count : '');
      }

      $('.total-new-count').text(total_new_count ? total_new_count : '');
    },
    loadItems: function(channel_id, variant) {
      var self = this;
      var items = this.activeItems.splice(0, this.pager + 1);

      if (items.length) {
        $(".runway .channel .items").append(this.renderItems(items));
        var selection = $(".channel-" + channel_id + "-" + variant + " .items .hide");

        $(selection).removeClass("hide").addClass("show");
        $(selection).find('abbr.timeago').timeago();
        $(selection).find(".image").each(function() {
          var container = this, image = new Image(), item = $(container).parent();

          image.src = $(item).data("image");

          image.onload = function() {
            $(item).removeClass('item-without-image').addClass('item-with-image');
            $(container).append(image);
          };
        });
      }
    },
    openPrevChannel: function() {
      var prevId = false;

      if (this.activeChannel == this.navigation[0].channel_id) {
        History.pushState({page: "channel", channel: "all", variant: "time"}, null, this.channelUrl("all", "time"));
        this.adjustChannelNavPos(true);
        return;
      }

      for (var i in this.navigation) {
        var id = this.navigation[i].channel_id;

        if (id == this.activeChannel) {
          if (prevId) {
            History.pushState({page: "channel", channel: prevId, variant: this.activeVariant}, null, this.channelUrl(prevId, this.activeVariant));
            this.adjustChannelNavPos(true);
            return;
          }
        }
        else {
          prevId = id;
        }
      }
    },
    adjustChannelNavPos: function(back) {
      var st = $("#channels .list").scrollTop();
      var inc = $("#channels .list li").first().outerHeight(true) - 1;

      $("#channels .list").scrollTop(back ? st - inc : st + inc);
    },
    openNextChannel: function() {
      var found = false;

      if (this.activeChannel == 'all') {
        History.pushState({page: "channel", channel: this.navigation[0].channel_id, variant: 'original'}, null, this.channelUrl(this.navigation[0].channel_id, 'original'));
        this.adjustChannelNavPos();
        return;
      }

      for (var i in this.navigation) {
        var id = this.navigation[i].channel_id;

        if (id == this.activeChannel) {
          found = true;
        }
        else if (found) {
          History.pushState({page: "channel", channel: id, variant: this.activeVariant}, null, this.channelUrl(id, this.activeVariant));
          this.adjustChannelNavPos();
          return;
        }
      }
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
    success: function(text, container) {
      var selector = "." + (container ? container : "messages");

      $(selector).animate({opacity: 0}, 100, function() {
        $(selector).css('opacity', 1).html("<div class=\"alert alert-success\">" + _.escape(text) + "</div>");
      });
    },
    error: function(text, container) {
      var selector = "." + (container ? container : "messages");

      $(selector).animate({opacity: 0}, 100, function() {
        $(selector).css('opacity', 1).html("<div class=\"alert alert-error\">" + _.escape(text) + "</div>");
      });
    },
    clearMessages: function() {
      $(".messages").html("");
    },
    showProgress: function() {
      $('body').css('opacity', '.4');
    },
    hideProgress: function() {
      $('body').css('opacity', '1');
    }
  }
  return Pagetty;
});