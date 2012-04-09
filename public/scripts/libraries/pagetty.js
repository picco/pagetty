define([
  'text!templates/channel_item.html',
  'icanhaz',
  'timeago',
  'underscore'
],function(channelItemTemplate) {
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

      $(".runway .more a").click(function() {
        self.loadMore($(this).data("channel"));
        return false;
      });

      return this;
    },
    renderTopStories: function() {
      var items = [];
      var self = this;
      var visible = true;
      var html = '';

      for (i in this.channels) {
        for (j in this.channels[i].items) {
          items.push(this.channels[i].items[j]);
        }
      }

      items = this.sortItemsByRelativeScore(items);

      console.dir(items);

      for (var i in items) {
        visible = (i <= this.pager) ? true : false;
        items[i].title += ' ' + parseFloat(items[i].relative_score).toPrecision(4);
        html += self.renderChannelItem(items[i], items[i].channel, visible);
      }

      $('.runway .channel-top .items').html(html);
      $(".runway .channel-top abbr.timeago").timeago();
      this.renderLoadMoreButton("top");
      this.rendered.push("top");
    },
    sortItemsByRelativeScore: function(items) {
      return items.sort(function(a, b) {
        return b.relative_score - a.relative_score;
      });
    },
    renderRecentStories: function() {
      var all_items = [];
      var self = this;
      var visible = true;
      var html = '';

      for (i in this.channels) {
        for (j in this.channels[i].items) {
          all_items.push({item: this.channels[i].items[j], channel: this.channels[i]});
        }
      }

      all_items = all_items.sort(function(a, b) {
        var a = new Date(a.item.created);
        var b = new Date(b.item.created);

        return b.getTime() - a.getTime();
      });

      for (var i in all_items) {
        visible = (i <= this.pager) ? true : false;
        html += self.renderChannelItem(all_items[i].item, all_items[i].channel, visible);
      }

      $('.runway .channel-recent .items').html(html);
      $(".runway .channel-recent abbr.timeago").timeago();
      this.renderLoadMoreButton("recent");
      this.rendered.push("recent");
    },
    renderChannelItem: function(item, channel, visible) {
      item.stamp = this.ISODateString(new Date(item.created));
      item.score = this.formatScore(item.score);
      item.channel = channel;
      item.class = visible ? "item-visible" : "item-hidden";
      item.visible = visible;
      if (item.id && item.image_url) item.image = "/images/" + item.id + ".jpg";
      return ich.channelItem(item, true);
    },
    renderLoadMoreButton: function(channel_id) {
      var selection = $(".channel-" + channel_id + " .items .item-hidden");

      if (selection.size()) {
        $(".runway .channel-" + channel_id).append('<div class="more"><a href="#" class="button" data-channel="' + channel_id + '">Show more stories</a></div>');
      }
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
    showChannel: function(channel_id) {
      var channel = this.channels[channel_id], html = '';

      if ($.isArray(this.channels[channel_id].items) && this.channels[channel_id].items.length) {

        this.channels[channel_id].items = this.channels[channel_id].items.sort(function(a, b) {
          return parseFloat(b.relative_score) - parseFloat(a.relative_score);
        });

        for (i in this.channels[channel_id].items) {
          visible = (i <= this.pager) ? true : false;
          html += this.renderChannelItem(this.channels[channel_id].items[i], this.channels[channel_id], visible);
        }
        this.renderLoadMoreButton(channel_id);
      }

      $('.runway .channel-normal').remove();
      $('.runway .channel').hide();
      $(".runway").append('<div class="channel channel-normal channel-' + channel_id + '"><div class="title"><h1><a href="' + channel.url + '" target="_blank">' + channel.name + '</a></h1></div><div class="items">' + html + '</div></div>');
      $(".runway .channel-" + channel_id).show();
      $(".runway .channel-" + channel_id + " abbr.timeago").timeago();
      $('#nav-channels li').removeClass('active');
      $('#nav-channels li.channel-' + channel_id).addClass('active');
      $(window).scrollTop(0);

      this.activeChannel = channel_id;
      this.rendered.push(channel_id);
      this.loadImages(channel_id);
      this.updateUI();

      return false;
    },
    showSpecial: function(name) {
      if (_.indexOf(this.rendered, name) == -1) {
        if (name == 'recent') this.renderRecentStories();
        if (name == 'top') this.renderTopStories();
      }

      this.activeChannel = name;
      $('.runway .channel').hide();
      $('.runway .channel-' + name).show();
      $('#nav-channels li').removeClass('active');
      $('#nav-channels li.' + name).addClass('active');
      $('html, body').scrollTop(0);
      this.loadImages(name);
      this.updateUI();
      $(window).scrollTop(0);
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
          self.state.channels[value._id].items_added = value.items_added;
          self.updates[value._id] = value.items;
          self.showUpdateNotification();
        });
      });
    },
    showUpdateNotification: function() {
      $('#refresh .refresh').html("Refresh").removeClass("approve").addClass("reload");
    },
    hideUpdateNotification: function() {
      $('#refresh .refresh').html("No updates").removeClass("reload").addClass("approve");
      $(".logo").animate({"padding-top": "65px"}, 100, "linear", function() {
        $(this).animate({"padding-top": "60px"}, 100, "linear");
      });
    },
    refreshChannels: function() {
      for (var i in this.updates) {
        this.channels[i].items = this.updates[i];
      }
      this.updates = [];
      this.renderTopStories();
      this.renderRecentStories();
      this.showSpecial('recent');
      this.hideUpdateNotification();
    },
    loadImages: function(channel_id) {
      $(".channel-" + channel_id + " .items .item-visible img").each(function(index, element) {
        $(this).attr("src", $(this).data("src"));
      });
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

      $(".runway .title").width($(".runway").width() - 2);
      $("aside").width($(".sidebar").width());

    },
    nextItem: function() {
      var self = this, scrollPos = $(document).scrollTop() + 70, nextPos = 0, itemPos = 0;
      $(".runway .channel-" + this.activeChannel + " .item").each(function() {
          itemPos = $(this).offset().top;
          if (itemPos > scrollPos) {
            $(window).scrollTop(itemPos - 70);
            return false;
          }
      });
    },
    prevItem: function() {
      var self = this, scrollPos = $(document).scrollTop() + 70, nextPos = 0, itemPos = 0, changePos = 0;
      var items = $(".runway .channel-" + this.activeChannel + " .item").get();

      for (var i in items) {
        itemPos = $(items[i]).offset().top;
          if (itemPos < scrollPos) {
            changePos = itemPos - 70
          }
          else {
            break;
          }
      }
      $(window).scrollTop(changePos);
    }
  }
  return Pagetty;
});