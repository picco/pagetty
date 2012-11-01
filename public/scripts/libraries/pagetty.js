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
    newItemsCount: 0,
    channelNewItemsCount: {},

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

      $(".app .logo, .app .mobile-logo").live("click", function(e) {
        if (self.activeChannel != 'all') {
          var channel = 'all', variant = 'time';
          History.pushState({page: 'channel', channel: channel, variant: variant}, null, self.channelUrl(channel, variant));
          e.preventDefault();
        }
      });

      $(".nav-list .channel a").live("click", function(e) {
        e.preventDefault();

        var channel = $(this).data("channel"), variant = $(this).data("variant");

        if (self.activeChannel == channel) {
          self.showChannel(channel, variant);
        }
        else {
          History.pushState({page: "channel", channel: channel, variant: variant}, null, self.channelUrl(channel, variant));
        }
      });

      $(".channel a.variant").live("click", function() {
        var channel = $(this).data("channel"), variant = $(this).data("variant");
        History.pushState({page: "channel", channel: channel, variant: variant}, null, self.channelUrl(channel, variant));
        return false;
      });

      $(".channel .item .site a").live("click", function(e) {
        var channel = $(this).data("channel");

        if (self.activeChannel == channel) {
          return true;
        }
        else {
          History.pushState({page: "channel", channel: channel, variant: 'original'}, null, self.channelUrl(channel, 'original'));
          return false;
        }
      });

      $('.unsubscribe').live("click", function() {
        var self = this;

        $.ajax("/unsubscribe", {
          type: "POST",
          data: {channel_id: $(self).data('channel')},
          success: function() {window.location = '/'},
          error: function() {alert('Could not unsubscribe.');},
        });
        return false;
      });

      $(".btn-subscribe-submit").bind("click", self.subscribe);
      $(".subscribe-url, .subscribe-name").bind("keypress", function(e) { if ((e.keyCode || e.which) == 13) self.subscribe(); });

      $('#subscribeModal').on('shown', function () {
        $('.subscribe-url').focus()
      })

      // Mobile

      $('.toggle-channel-nav').live('click', function(e) {
        e.preventDefault();

        $('.channel-nav').addClass('hide');

        if ($(this).hasClass('open')) {
          $(this).removeClass('open');
          $('.channel .items').removeClass('hide');
        }
        else {
          $(this).addClass('open');
          $('.channel .items').addClass('hide');
          $('.channel-' + self.activeChannel + '-' + self.activeVariant + ' .channel-nav').removeClass('hide');
        }

        window.scrollTo(0, 0);

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
      }, 60000);

      // Sidebar scroll
      window.setTimeout(function() {
        $("aside").niceScroll({scrollspeed: 1, mousescrollstep: 40, cursorcolor: "#fafafa", cursorborder: "none", zindex: 1});
      }, 1000);

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
      var html = "", item = {};

      for (var i in items) {
        item = _.clone(items[i]);
        item.stamp = moment(item.created).format();
        item.score = parseInt(item.score) ?  this.formatScore(item.score) : false;
        item.visible = (i <= this.pager) ? true : false;
        item.className = item.visible ? "show" : "hide";
        if (item.isnew) item.className += " new";
        if (item.id && item.image) item.image_url = '/imagecache/' + item.id + '-' + item.image_hash + '.jpg';

        // Reduce long channel names
        if (item.channel.name.length > 30) {
          item.channel.name = item.channel.name.substr(0, 30) + "...";
        }

        html += ich.channelItem(item, true);
      }

      return html;
    },
    mark: function(self, channel, item) {
      for (var i in self.state.channels[channel].items) {
        if (self.state.channels[channel].items[i].id == item) {
          $('.channel-' + self.activeChannel + '-' + self.activeVariant + ' .item-' + item).addClass('read');
          $.get('/api/mark/' + channel + '/' + item);
          self.state.channels[channel].items[i].isnew = false;
          self.updateChannelCounts(channel);
          break;
        }
      }
    },
    markVisibleItems: function() {
      var self = this;
      var selector = ".channel-" + self.activeChannel + "-" + self.activeVariant + ' .item.show.new:not(.read)';

      $(selector).each(function(index, item) {
        var bottom_position = $(item).position().top + $(item).height() - $(window).scrollTop();

        if (bottom_position != 0 && bottom_position <= $(window).height()) {
          self.mark(self, $(item).data('channel'), $(item).data('item'));
        }
      });
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

      for (var i in this.state.channels[channel_id].items) {
        if (this.state.channels[channel_id].items[i].isnew) new_count++;
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

      if (0 && this.cache[cacheKey] && $(selector).length) {
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

        if (channel_id == "all") {
          $(".runway .inner").append(ich.channelAll({variant: variant, subscription: {name: "All stories"}, items: html, nav: self.navigation, count: items.length, user: self.user}));
        }
        else {
          $(".runway .inner").append(ich.channel({channel: self.channels[channel_id], variant: variant, subscription: self.user.subscriptions[channel_id], items: html, nav: self.navigation, count: items.length, user: self.user}));
        }

        // Time ago.
        $(selector + ' .items abbr.timeago').timeago();

        // Scroll events.
        self.bindScrollEvents();

        // Lazy load images.
        self.loadImages($(selector + " .items .show"));
      }

      $('li.channel, a.variant').removeClass('active');
      $('li.channel-' + channel_id + ", a.variant." + channel_id + "-" + variant).addClass('active');
      $('li.channel-' + channel_id).addClass('active');
      $("#channels .list li.channel-" + channel_id).removeClass("loading");

      $('.toggle-channel-nav').removeClass('open');
      $('.channel-nav').addClass('hide');
      $('.channel .items').removeClass('hide');

      this.cache[cacheKey] = true;
      self.updateTitle();
      window.scrollTo(0, 0);

      // Mark visible items as read.
      //self.markVisibleItems.apply(self);

      return false;
    },
    bindScrollEvents: function() {
      var self = this;

      $(window).unbind('scroll');

      // Mark items as read if scrolled past.

      $(window).scroll(function(e) {self.markVisibleItems.apply(self)});

      // Lazy load additional stories when the page is scrolled near to the bottom.

      $(window).scroll(function() {
        if ($(window).scrollTop() + $(window).height() >= $(document).height() - 100) {
          self.loadMore(self.activeChannel, self.activeVariant);
        }
      });
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
      var state = {}

      for (var channel_id in this.state.channels) {
        state[channel_id] = this.state.channels[channel_id].items_added;
      }

      $.getJSON("/api/state/updates", {state: JSON.stringify(state)}, function(new_state) {
        for (var channel_id in new_state.channels) {
          self.state.channels[channel_id] = new_state.channels[channel_id];
        }
        self.updateAllCounts();
      }).error(function(xhr, status, error) {
        // The session has timed out.
        if (xhr.status == 403) window.location.href = '/';
      });
    },
    updateTitle: function() {
      if (this.newItemsCount) {
        document.title = "(" + this.newItemsCount + ") " + this.activeTitle + " - Pagetty";
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