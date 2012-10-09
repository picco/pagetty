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
  "store",
],function(channelItemTemplate, channelTemplate, channelAllTemplate) {

  var Pagetty = {
    cache: [],
    activeChannel: false,
    activeTitle: false,
    activeVariant: false,
    pager: 9,
    updates: {},
    newItemsCount: 0,

    init: function(user, channels, appState) {
      var self = this;

      this.user = user;
      this.appState = appState;
      this.subscriptions = user.subscriptions;
      this.state = {};
      this.navigation = [];

      this.channels = this.prepareChannels(this.subscriptions, channels, this.appState.channels);

      if (this.appState.channels) {
        // This will complete later and this.channels will remain as-is.
        this.updateChannels();
      }

      this.saveState({channels: this.channels});

      // Initialize theme.

      ich.addTemplate("channelItem", channelItemTemplate);
      ich.addTemplate("channel", channelTemplate);
      ich.addTemplate("channelAll", channelAllTemplate);

      for (channel_id in this.subscriptions) {
        this.navigation.push({channel_id: channel_id, name: this.subscriptions[channel_id].name});
      }

      this.navigation.sort(function(a, b) {
        var x = a.name.toLowerCase(), y = b.name.toLowerCase();
        return ( ( x == y ) ? 0 : ( ( x > y ) ? 1 : -1 ) );
      });

      for (var i in this.navigation) {
        $("#channels .list").append('<li class="channel channel-' + this.navigation[i].channel_id + '"><a href="/channel/' + this.navigation[i].channel_id + '" data-channel="' + this.navigation[i].channel_id + '">' + _.escape(this.navigation[i].name) + '</a></li>');
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
        History.pushState({page: "channel", channel: channel, variant: variant}, null, self.channelUrl(channel, variant));
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

      $(".new-stories, .refresh").live("click", function(e) {
        var stateData = History.getState().data;

        e.preventDefault();
        self.refreshChannels();

        if (stateData.page == "channel" && stateData.channel == "all" && stateData.variant == "time") {
          self.showChannel("all", "time");
        }
        else {
          History.pushState({page: "channel", channel: "all", variant: "time"}, null, self.channelUrl("all", "time"));
        }
        return false;
      });

      $('.btn-subscribe').click(function() {
        $(".btn-subscribe-submit").bind("click", self.subscribe);
        $(".subscribe-url").bind("keypress", function(e) { if ((e.keyCode || e.which) == 13) self.subscribe; });
      });

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

      // Lazy load additional stories when the page is scrolled near to the bottom.

      $(window).scroll(function() {
        if ($(window).scrollTop() + $(window).height() >= $(document).height() - 100) {
          self.loadMore(self.activeChannel, self.activeVariant);
        }
      });

      // Auto-update channels.

      window.setInterval(function() {
        self.updateChannels();
      }, 5000);

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
    prepareChannels: function(subscriptions, channels, storedChannels) {
      var prepared = {};

      console.dir(subscriptions);
      console.dir(channels);
      console.dir(storedChannels);

      for (var channel_id in subscriptions) {
        var items = [];

        if (storedChannels && storedChannels[channel_id] && storedChannels[channel_id].items) {
          for (var i in channels[channel_id].items) {
            for (var j in storedChannels[channel_id].items) {
              if (channels[channel_id].items[i].id == storedChannels[channel_id].items[j].id) {
                // The the new item as the base.
                var item = _.clone(channels[channel_id].items[i]);
                // We need to keep the isnew status.
                item.isnew = storedChannels[channel_id].items[j].isnew || false;
                // Push to the items array.
                items.push(item);
                // Correct match is found, break the loop.
                break;
              }
            }
          }
          prepared[channel_id] = _.clone(storedChannels[channel_id]);
          prepared[channel_id].items = items;
        }
        else {
          // There's no store, just use all the fresh items.
          prepared[channel_id] = _.clone(channels[channel_id]);
        }

        // Save the state of channels.
        this.state[channel_id] = _.clone(prepared[channel_id].items_added);
      }

      return prepared;
    },
    aggregateAllItems: function() {
      var items = [];

      for (i in this.channels) {
        for (j in this.channels[i].items) {
          var item = _.clone(this.channels[i].items[j]);
          item.channel = {id: this.channels[i]._id, name: this.subscriptions[i].name, url: this.channels[i].url};
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
          return parseFloat(b.relative_score) - parseFloat(a.relative_score);
        });
      }
      else {
        return items;
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
      var self = this;
      var html = "";
      var cacheKey = "";
      var selector = "";

      if (!variant) {
        variant = channel_id == "all" ? "time" : "original";
      }

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
          html = self.renderItems(self.sortItems(self.aggregateAllItems(), variant));
        }
        else {
          if (!_.isUndefined(self.channels[channel_id]) && $.isArray(self.channels[channel_id].items) && self.channels[channel_id].items.length) {
            for (i in self.channels[channel_id].items) {
              self.channels[channel_id].items[i].channel = {id: self.channels[channel_id]._id, name: self.subscriptions[channel_id].name, url: self.channels[channel_id].url};
            }
            html = self.renderItems(self.sortItems(self.channels[channel_id].items, variant));
          }
        }

        if (channel_id == "all") {
          $(".runway .inner").append(ich.channelAll({variant: variant, subscription: {name: "All stories"}, items: html, nav: self.navigation}));
        }
        else {
          $(".runway .inner").append(ich.channel({channel: self.channels[channel_id], variant: variant, subscription: self.subscriptions[channel_id], items: html, nav: self.navigation}));
        }

        // Time ago.
        $(selector + " abbr.timeago").timeago();

        // Lazy load images.
        self.loadImages($(selector + " .items .show"));
      }

      $('#channels .list li, a.variant').removeClass('active');
      $('#channels .list li.channel-' + channel_id + ", a.variant." + channel_id + "-" + variant).addClass('active');
      $("#channels .list li.channel-" + channel_id).removeClass("loading");


      $('.channel-nav').addClass('hide');
      $('.channel-nav .channel-' + channel_id + ' a').addClass('active');
      $('.channel .items').removeClass('hide');
      $('.toggle-channel-nav').removeClass('open');

      this.cache[cacheKey] = true;
      self.activeChannel = channel_id;
      self.activeVariant = variant;
      self.activeTitle = this.activeChannel == "all" ? "All stories" : this.subscriptions[channel_id].name;

      if (self.newItems) {
        self.showUpdateNotification();
      }
      else {
        self.updateTitle();
      }

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
    saveState: function(stateInfo) {
      $.post("/api/state", {data: JSON.stringify(stateInfo)});
    },
    updateChannels: function() {
      var self = this;

      $.getJSON("/api/channel/updates", {state: JSON.stringify(this.state)}, function(updates) {
        if (updates.length) {
          for (var i in updates) {
            self.state[updates[i]._id] = updates[i].items_added;
            self.updates[updates[i]._id] = updates[i].items;
          }
          self.processUpdates();
        }
      });
    },
    processUpdates: function() {
      var count = 0;

      for (var channel_id in this.updates) {
        for (var i in this.updates[channel_id]) {
          if (this.itemExists(this.updates[channel_id][i], this.channels[channel_id].items)) {
            this.updates[channel_id][i].isnew = false;
          }
          else {
            this.updates[channel_id][i].isnew = true;
            count++;
          }
        }
      }

      if (count) {
        this.newItems = true;
        this.newItemsCount = count;
        this.showUpdateNotification();
      }
    },
    itemExists: function(item, list) {
      for (var i in list) {
        if (list[i].id == item.id) {
          return true;
        }
      }
      return false;
    },
    refreshChannels: function() {
      for (var channel_id in this.channels) {
        for (var i in this.channels[channel_id].items) {
          // Clear the isnew status from all existing items,
          // updates below will overwrite this with last items marked as new.
          this.channels[channel_id].items[i].isnew = false;
        }
      }

      for (var channel_id in this.updates) {
        this.channels[channel_id].items = this.updates[channel_id];
      }

      this.cache = [];
      this.newItems = false;
      this.newItemsCount = 0;
      this.updates = {};
      this.saveState({channels: this.channels});
      this.hideUpdateNotification();
    },
    showUpdateNotification: function() {
      if (this.newItemsCount > 0) {
        $(".app .runway").addClass("with-messages");
        $(".channel .messages").html('<a class="new-stories" href="#"><i class="icon-refresh"></i> <span class="count">' + this.newItemsCount + ' </span>' + (this.newItemsCount == 1 ? 'new story' : 'new stories') + '. Click here to update.</a>');
        $('.new-items-count').html(this.newItemsCount);
        $('.refresh').show();
        this.updateTitle();
      }
    },
    hideUpdateNotification: function() {
      $(".app .runway").removeClass("with-messages");
      $(".channel .messages").html("");
      $('.refresh').hide();
      this.updateTitle();
    },
    updateTitle: function() {
      if (this.newItemsCount) {
        $("title").html("(" + this.newItemsCount + ") " + this.activeTitle + " - Pagetty");
      }
      else {
        $("title").html(this.activeTitle + " - Pagetty");
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
    subscribe: function() {
      $.ajax("/subscribe", {
        type: "POST",
        data: {url: $(".subscribe-url").val()},
        success: function(data) {
          window.location = "/channel/" + data.channel_id;
        },
        error: function(xhr, status, error) {
          Pagetty.error(xhr.responseText, 'subscribe-messages');
        }
      });
    },
    success: function(text, container) {
      $("." + (container ? container : "messages")).html("<div class=\"alert alert-success\">" + _.escape(text) + "</div>");
    },
    error: function(text, container) {
      $("." + (container ? container : "messages")).html("<div class=\"alert alert-error\">" + _.escape(text) + "</div>");
    },
    clearMessages: function() {
      $(".messages").html("");
    }
  }
  return Pagetty;
});