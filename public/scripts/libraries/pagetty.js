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
    cache: [],
    activeChannel: false,
    activeTitle: false,
    activeVariant: false,
    pager: 9,
    channelNewItemsCount: {},
    updateNotificationActive: false,

    init: function(user, channels, state) {
      var self = this;

      // User information.
      this.user = user;
      // Channel information.
      this.channels = channels;
      // State information (news items).
      this.state = state;
      // Prepared navigation data.
      this.navigation = [];
      // New item counts per channel.
      this.counts = {};

      // Initialize theme.
      ich.addTemplate("channelItem", channelItemTemplate);
      ich.addTemplate("channel", channelTemplate);
      ich.addTemplate("channelAll", channelAllTemplate);

      // Init counts
      this.updateAllCounts();

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

      $(".btn-subscribe-submit").bind("click", self.subscribe);
      $(".subscribe-url, .subscribe-name").bind("keypress", function(e) { if ((e.keyCode || e.which) == 13) self.subscribe(); });

      $('#subscribeModal').on('shown', function () {
        $('.subscribe-url').focus()
      })

      $("#channels .nav-list .channel a").bind("click", function(e) {
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

      // Update channel counts.
      this.updateAllCounts();

      // Auto-update channels.

      window.setInterval(function() {
        self.updateChannels();
      }, 20000);

      // Sidebar scroll

      window.setTimeout(function() {
        $("aside").niceScroll({scrollspeed: 1, mousescrollstep: 40, cursorcolor: "#fafafa", cursorborder: "none", zindex: 1});
      }, 1000);

      // Load more on scroll.

      $(window).scroll(function() {
        if ($(window).scrollTop() + $(window).height() >= $(document).height() - 100) {
          self.loadMore(self.activeChannel, self.activeVariant);
        }
      });

      // ...
      if (this.state.new_items) this.updateNotificationActive = true;

      // Run the application.
      this.runApp();
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
    aggregateAllItems: function() {
      var items = [];

      for (i in this.state.channels) {
        for (j in this.state.channels[i].items) {
          var item = _.clone(this.state.channels[i].items[j]);
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
        return items;
      }
    },
    renderItems: function(items) {
      var html = "", item = {}, j = 0;

      for (var i in items) {
        item = _.clone(items[i]);
        item.stamp = moment(item.created).format();
        item.score = parseInt(item.score) ?  this.formatScore(item.score) : false;
        item.visible = (i <= this.pager) ? true : false;
        item.className = item.visible ? "show" : "hide";

        if (j++) {
          item.className += ' item-short';
        }
        else {
          item.className += ' item-full';
        }

        if (item.isnew) item.className += " new";
        if (item.id && item.image) {
          item.className += ' item-with-image';
          item.image_url = '/imagecache/' + item.id + '-' + item.image_hash + '.jpg';
        }
        else {
          item.className += 'item-without-image';
        }

        // Reduce long channel names
        if (item.channel.name.length > 30) {
          item.channel.name = item.channel.name.substr(0, 30) + "...";
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
    updateAllCounts: function() {
      for (channel_id in this.user.subscriptions) {
        this.updateChannelCounts(channel_id);
      }
    },
    updateChannelCounts: function(channel_id) {
      var new_count = 0;
      var total_new_count = 0;

      if (this.state.channels[channel_id].items) {
        for (var i in this.state.channels[channel_id].items) {
          if (this.state.channels[channel_id].items[i].isnew) new_count++;
        }
      }

      this.counts[channel_id] = new_count;

      $('.channel-' + channel_id + ' .new-count').text(this.counts[channel_id] ? this.counts[channel_id] : '');

      for (var i in this.counts) {
        total_new_count += this.counts[i];
      }

      $('.total-new-count').text(total_new_count ? total_new_count : '');
    },
    showChannel: function(channel_id, variant) {
      var self = this;
      var items = [];
      var html = "";
      var cacheKey = "";
      var selector = "";
      var messages = {};

      if (!variant) {
        variant = channel_id == "all" ? "time" : "original";
      }

      self.activeChannel = channel_id;
      self.activeVariant = variant;
      self.activeTitle = this.activeChannel == "all" ? "All stories" : this.user.subscriptions[channel_id].name;

      selector = ".channel-" + channel_id + "-" + variant;
      cacheKey = channel_id + ":" + variant;

      $("#channels .list li.channel-" + channel_id).addClass("loading");
      $(".runway > .inner > .channel").hide();

      if (this.cache[cacheKey] && $(selector).length) {
        $(selector).show();
      }
      else {
        $(selector).remove();

        if (channel_id == "all") {
          items = self.aggregateAllItems();
          html = self.renderItems(self.sortItems(items, variant));
        }
        else {
          if (!_.isUndefined(self.state.channels[channel_id]) && $.isArray(self.state.channels[channel_id].items) && self.state.channels[channel_id].items.length) {
            items = _.clone(self.state.channels[channel_id].items);

            for (i in items) {
              items[i].channel = {id: channel_id, name: self.user.subscriptions[channel_id].name, url: self.channels[channel_id].url};
            }

            html = self.renderItems(self.sortItems(items, variant));
          }
        }

        messages.new_show = this.updateNotificationActive ? 'style="display: block"' : '';
        messages.new_count = this.state.new_items;
        messages.new_label = this.state.new_items == 1 ? 'new story' : 'new stories';

        if (channel_id == "all") {
          $(".runway .inner").append(ich.channelAll({
            variant: variant,
            subscription: {name: "All stories"},
            items: html,
            messages: messages,
            nav: self.navigation,
            count: items.length,
            user: self.user
          }));
        }
        else {
          $(".runway .inner").append(ich.channel({
            channel: self.channels[channel_id],
            variant: variant,
            subscription: self.user.subscriptions[channel_id],
            items: html,
            messages: messages,
            nav: self.navigation,
            count: items.length,
            user: self.use
          }));
        }

        // Time ago.
        $(selector + ' .items abbr.timeago').timeago();

        // Lazy load images.
        self.loadImages($(selector + " .items .show"));
      }

      if (this.updateNotificationActive) {
        $(".app .runway").addClass("with-messages");
      }

      $('li.channel, a.variant').removeClass('active');
      $('li.channel-' + channel_id + ", a.variant." + channel_id + "-" + variant).addClass('active');
      $('li.channel-' + channel_id).addClass('active');
      $("#channels .list li.channel-" + channel_id).removeClass("loading");

      $('.toggle-channel-nav').removeClass('open');
      $('.channel-nav').addClass('hide');
      $('.channel .items').removeClass('hide');

      // Bindings

      $(selector + " a.variant").bind("click", function() {
        var channel = $(this).data("channel"), variant = $(this).data("variant");
        History.pushState({page: "channel", channel: channel, variant: variant}, null, self.channelUrl(channel, variant));
        return false;
      });

      $(selector + " .item .site a").bind("click", function(e) {
        var channel = $(this).data("channel");

        if (self.activeChannel == channel) {
          return true;
        }
        else {
          History.pushState({page: "channel", channel: channel, variant: 'original'}, null, self.channelUrl(channel, 'original'));
          return false;
        }
      });

      $(selector + " .new-stories, " + selector + " .refresh").bind("click", function(e) {
        self.refreshChannels();
        e.preventDefault();
      });

      $(selector + ' .toggle-channel-nav').bind('click', function(e) {
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

      $(selector + ".app .logo, " + selector + " .app .mobile-logo").bind("click", function(e) {
        if (self.activeChannel != 'all') {
          var channel = 'all', variant = 'time';
          History.pushState({page: 'channel', channel: channel, variant: variant}, null, self.channelUrl(channel, variant));
          e.preventDefault();
        }
      });

      $(selector + " .nav-list .channel a").bind("click", function(e) {
        e.preventDefault();

        var channel = $(this).data("channel"), variant = $(this).data("variant");

        if (self.activeChannel == channel) {
          self.showChannel(channel, variant);
        }
        else {
          History.pushState({page: "channel", channel: channel, variant: variant}, null, self.channelUrl(channel, variant));
        }
      });

      this.cache[cacheKey] = true;
      self.updateTitle();
      window.scrollTo(0, 0);

      return false;
    },
    loadImages: function(items) {
      $(items).find(".image").each(function() {
        var item = this, image = new Image();
        image.src = $(this).data("image");
        image.onload = function() {
          $(item).append(image);
        };
      });
    },
    updateChannels: function() {
      var self = this;

      $.getJSON("/api/state/new", function(state) {
        self.state.new_items = state.new_items;
        if (self.state.new_items) self.updateNotificationActive = true;
        self.showUpdateNotification();
      }).error(function(xhr, status, error) {
        // The session has timed out.
        if (xhr.status == 403) window.location.href = '/';
      });
    },
    refreshChannels: function() {
      var self = this;
      var stateData = History.getState().data;

      $.getJSON("/api/state/refresh", function(new_state) {
        self.state = new_state;
        self.cache = [];
        self.hideUpdateNotification();
        self.updateAllCounts();

        if (stateData.page == "channel" && stateData.channel == "all" && stateData.variant == "time") {
          self.showChannel("all", "time");
        }
        else {
          History.pushState({page: "channel", channel: "all", variant: "time"}, null, self.channelUrl("all", "time"));
        }

      }).error(function(xhr, status, error) {
        // The session has timed out.
        if (xhr.status == 403) window.location.href = '/';
      });
    },
    showUpdateNotification: function() {
      if (this.updateNotificationActive == true && this.state.new_items > 0) {
        $(".app .runway").addClass("with-messages");
        $('.channel .massages .count').text(this.state.new_items);
        $('.channel .massages .lbl').text(this.state.new_items == 1 ? 'new story' : 'new stories');
        $(".channel .messages").show();
        // Mobile.
        $('.new-items-count').html(this.state.new_items);
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
      if (this.state.new_items) {
        document.title = "(" + this.state.new_items + ") " + this.activeTitle + " - Pagetty";
      }
      else {
        document.title = this.activeTitle + " - Pagetty";
      }
    },
    loadMore: function(channel_id, variant) {
      var self = this, selection = $(".channel-" + channel_id + "-" + variant + " .items .hide");

      if (selection.length) {
        var slice = selection.slice(0, this.pager + 1);

        self.loadImages(slice);
        slice.each(function(index, element) {
          $(this).removeClass("hide").addClass("show");
        });
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
    subscribe: function() {
      $.ajax("/subscribe", {
        type: "POST",
        data: {url: $(".subscribe-url").val(), name: $(".subscribe-name").val()},
        dataType: "json",
        success: function(data) {
          window.location = data.item_count ? ("/channel/" + data.channel_id) : ("/channel/" + data.channel_id + "/configure?empty");
        },
        error: function(xhr, status, error) {
          Pagetty.error(xhr.responseText, 'subscribe-messages');
        }
      });
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