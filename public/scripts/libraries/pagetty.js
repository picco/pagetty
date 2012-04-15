define([
  'text!templates/channel_item.html',
  'text!templates/channel.html',
  'text!templates/channel_all.html',
  'icanhaz',
  'timeago',
  'underscore'
],function(channelItemTemplate, channelTemplate, channelAllTemplate) {
  var Pagetty = {
    activeChannel: false,
    pager: 9,
    state: {channels: {}},
    updates: {},
    rendered: [],

    init: function(channels) {
      var self = this;
      this.channels = channels;
      ich.addTemplate("channelItem", channelItemTemplate);
      ich.addTemplate("channel", channelTemplate);
      ich.addTemplate("channelAll", channelAllTemplate);
      //this.setLastUpdateCookie();

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
          item.channel = {name: this.channels[i].name, url: this.channels[i].url};
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
        items[i].class = items[i].visible ? "item-visible" : "item-hidden";
        if (items[i].isnew) items[i].class += " new";
        if (items[i].id && items[i].image_url) items[i].image = "/images/" + items[i].id + ".jpg";
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
      var channel = this.channels[channel_id], html = '';

      if (!variant) {
        variant = channel_id == "all" ? "time" : "original";
      }

      if (channel_id == "all") {
        html = this.renderItems(this.sortItems(this.aggregateAllItems(), variant));
      }
      else {
        if ($.isArray(this.channels[channel_id].items) && this.channels[channel_id].items.length) {
          for (i in this.channels[channel_id].items) {
            this.channels[channel_id].items[i].channel = {name: this.channels[channel_id].name, url: this.channels[channel_id].url};
          }
          html = this.renderItems(this.sortItems(this.channels[channel_id].items, variant));
        }
      }

      $('.runway .channel').remove();

      if (channel_id == "all") {
        $(".runway").append(ich.channelAll({channel: channel, items: html}));
      }
      else {
        $(".runway").append(ich.channel({channel: channel, items: html}));
      }

      $(".runway .channel-" + channel_id + " abbr.timeago").timeago();
      $('#nav-channels li, a.channel-variant').removeClass('active');
      $('#nav-channels li.channel-' + channel_id + ", a.channel-variant." + channel_id + "-" + variant).addClass('active');

      $(".channel-" + channel_id + " .items .item-visible img").each(function(index, element) {
        $(this).attr("src", $(this).data("src"));
      });

      // Add "Load more" button.

      var selection = $(".channel-" + channel_id + " .items .item-hidden");

      if (selection.size()) {
        $(".runway .channel-" + channel_id).append('<div class="more"><a href="#" class="button" data-channel="' + channel_id + '">Show more stories</a></div>');
      }

      $(window).scrollTop(0);

      this.activeChannel = channel_id;
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
      var selection = $(".channel-" + channel_id + " .items .item-hidden");

      if (selection.length) {
        selection.slice(0, this.pager + 1).each(function(index, element) {
          $(this).removeClass("item-hidden").addClass("item-visible");
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
      var rb = $("#refresh .refresh");
      //rb.width($("aside").width() - (rb.outerWidth(true) - rb.width()));

      $(".runway img").error(function(){
        console.log("Broken image detected:" + $(this).attr("src"));
        $(this).parent().parent().remove();
      });

      if ($(window).width() > 767) {
        $("aside.right").niceScroll({scrollspeed: 1, mousescrollstep: 40, cursorcolor: "#f1f1f1", cursorborder: "none", zindex: 1});
        $("aside").height($(window).height());
      }
      else {
        $("aside.right").getNiceScroll().remove();
        $("aside.right").css("height", "");
      }

      $(".runway .title").width($(".runway").width());
      $(".runway").css("padding-top", $(".runway .title").height() + 20);
      $("aside").width($(".sidebar").width());

    },
    nextItem: function() {
      var adjust = $(".runway .title").height() + 20;
      var self = this, scrollPos = $(document).scrollTop() + adjust, nextPos = 0, itemPos = 0;

      $(".runway .channel-" + this.activeChannel + " .item").each(function() {
          itemPos = $(this).offset().top;
          if (itemPos > scrollPos) {
            $(window).scrollTop(itemPos - adjust);
            return false;
          }
      });
    },
    prevItem: function() {
      var adjust = $(".runway .title").height() + 20;
      var self = this, scrollPos = $(document).scrollTop() + adjust, nextPos = 0, itemPos = 0, changePos = 0;
      var items = $(".runway .channel-" + this.activeChannel + " .item").get();

      for (var i in items) {
        itemPos = $(items[i]).offset().top;
          if (itemPos < scrollPos) {
            changePos = itemPos - adjust;
          }
          else {
            break;
          }
      }
      $(window).scrollTop(changePos);
    },
    setLastUpdateCookie: function() {
      var date = new Date();
      this.createCookie("lastUpdate", date);
    },
    createCookie: function(name, value, days) {
      if (days) {
        var date = new Date();
        date.setTime(date.getTime()+(days*24*60*60*1000));
        var expires = "; expires="+date.toGMTString();
      }
      else var expires = "";
      document.cookie = name+"="+value+expires+"; path=/";
    },
    readCookie: function(name) {
      var nameEQ = name + "=";
      var ca = document.cookie.split(';');
      for(var i=0;i < ca.length;i++) {
        var c = ca[i];
        while (c.charAt(0)==' ') c = c.substring(1,c.length);
        if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length,c.length);
      }
      return null;
    },
    eraseCookie: function(name) {
      createCookie(name,"",-1);
    }
  }
  return Pagetty;
});