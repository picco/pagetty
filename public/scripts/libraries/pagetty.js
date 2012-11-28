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
    activePage: 0,
    activeExhausted: false,
    activeLoadInProgress: false,
    new_items: 0,

    init: function(user, channels) {
      var self = this;

      // User information.
      this.user = user;
      // Channel information.
      this.channels = channels;
      // Prepared navigation data.
      this.navigation = [];

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

      var domain = null;

      for (var i in this.navigation) {
        domain = this.channels[this.navigation[i].channel_id].domain;
        $("#channels .list").append('<li class="channel channel-' + this.navigation[i].channel_id + '"><a style="background-image: url(http://s2.googleusercontent.com/s2/favicons?domain=' + escape(domain) + ')" href="/channel/' + this.navigation[i].channel_id + '" data-channel="' + this.navigation[i].channel_id + '">' + _.escape(this.navigation[i].name) + ' <span class="new-count pull-right"></span></a></li>');
      }

      // Calculate nav height;

      $(window).resize(function() {
        self.adjustUI();
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

      // Act on refresh.

      $(".new-stories a, .channel .refresh").on("click", function(e) {
        return self.fetchUpdates();
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
          self.loadItems();
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
      window.setTimeout(function() { self.checkUpdates(); }, 500)
      window.setInterval(function() { self.checkUpdates(); }, 60000);
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
      self.adjustUI();
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
      this.activePage = 0;
      this.activeExhausted = false;
      this.activeLoadInProgress = false;
      this.activeTitle = this.activeChannel == "all" ? "All stories" : this.user.subscriptions[channel_id].name;

      // Reusable selector for this channel: .channel-id-variant
      selector = ".channel-" + channel_id + "-" + variant;

      $('.runway .channel').remove();

      if (channel_id == "all") {
        $(".runway .inner").html(ich.channelAll({
          variant: variant,
          subscription: {name: "All stories"},
          nav: self.navigation,
          user: self.user
        }));
      }
      else {
        $(".runway .inner").html(ich.channel({
          channel: self.channels[channel_id],
          variant: variant,
          subscription: self.user.subscriptions[channel_id],
          nav: self.navigation,
          user: self.user
        }));
      }

      self.loadItems(this.activeChannel, this.activeVariant);

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
    renderItems: function(items) {
      var html = '', item = {}, j = 0;

      for (var i in items) {
        item = _.clone(items[i]);

        item.channel_name = this.user.subscriptions[item.channel_id].name;
        item.channel_url = this.channels[item.channel_id].url;

        if (item.channel_name.length > 40) {
          item.channel_name = item.channel_name.substr(0, 40) + '...';
        }

        item.stamp = moment(item.created).format();
        item.score = parseInt(item.score) ?  this.formatScore(item.score) : false;
        item.className = 'item-short item-without-image hide';

        console.dir(item.created);
        console.dir(this.user);

        if (item.created > this.user.low) item.className += ' new';

        if (item.image) {
          item.image_url = '/imagecache/' + item._id + '-' + item.image_hash + '.jpg';
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
      if (this.new_items) {
        $('.new-stories .count').text(this.new_items);
        $('.new-stories .lbl').text(this.new_items == 1 ? 'new story' : 'new stories');
        $('.new-stories').show();
        $('.new-items-count').html(this.new_items);
        $('.channel .refresh').show();

        this.updateTitle();
        this.adjustUI();
      }
    },
    hideUpdateNotification: function() {
      $(".new-stories").hide();
      $('.channel .refresh').hide();

      this.updateTitle();
      this.adjustUI();
    },
    updateTitle: function() {
      document.title = this.activeTitle + " - Pagetty";
    },
    checkUpdates: function() {
      var self = this;

      $.getJSON('/api/items/new').success(function(data) {
        self.new_items = data.count;
        self.showUpdateNotification();
      });
    },
    fetchUpdates: function() {
      var self = this;

      $.get('/api/update').success(function(data) {
        var stateData = History.getState().data;

        if (stateData.page == "channel" && stateData.channel == "all" && stateData.variant == "time") {
          self.showChannel("all", "time");
        }
        else {
          History.pushState({page: "channel", channel: "all", variant: "time"}, null, self.channelUrl("all", "time"));
        }

        $("#channels .list").scrollTop(0);
        self.hideUpdateNotification();
      });

      return false;
    },
    updateCounts: function() {
      var total_new_count = 0;

      for (channel_id in this.user.subscriptions) {
        var new_count = 0;
        // Rewrite
        $('.channel-' + channel_id + ' .new-count').text(new_count ? new_count : '');
      }

      $('.total-new-count').text(total_new_count ? total_new_count : '');
    },
    loadItems: function() {
      var self = this;

      if (!this.activeExhausted && !this.activeLoadInProgress) {
        this.activeLoadInProgress;

        $.getJSON('/api/items/' + this.activeChannel + '/' + this.activePage).success(function(items) {
          if (items.length) {
            $(".runway .channel .items").append(self.renderItems(items));
            var selection = $(".channel-" + self.activeChannel + "-" + self.activeVariant + " .items .hide");

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
          else {
            self.activeExhausted = true;
          }

          this.activeLoadInProgress = false;
        });

        this.activePage++;
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
    adjustUI: function() {
      var wh = $(window).outerHeight();
      var ah = 33; // #account
      var chh = $('#channels .header').height();
      var nsh = $('#channels .new-stories').height();

      $('#channels .list').css('max-height', (wh - ah - chh - nsh - 40) + 'px');
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