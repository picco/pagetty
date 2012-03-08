define([
  'text!templates/channel_item.html',
  'icanhaz',
  'timeago'
],function(channelItemTemplate) {
  var Pagetty = {
    pager: 9,
    state: {channels: {}},
    updates: {},

    init: function(channels) {
      var self = this;
      this.channels = channels;
      ich.addTemplate("channelItem", channelItemTemplate);

      for (i in this.channels) {
        var channel = this.channels[i];
        this.state.channels[this.channels[i]._id] = this.channels[i].items_added;
        this.renderChannel(channel._id);
      }

      this.renderTopStories();
      this.renderRecentStories();
      $("abbr.timeago").timeago();
      $(".loadmore a").click(function() {
        self.loadMore($(this).data("channel"));
        return false;
      });

      return this;
    },
    renderChannel: function(channel_id) {
      var html = '';

      if ($.isArray(this.channels[channel_id].items) && this.channels[channel_id].items.length) {
        for (i in this.channels[channel_id].items) {
          visible = (i <= this.pager) ? true : false;
          html += this.renderChannelItem(this.channels[channel_id].items[i], this.channels[channel_id], visible);
        }
        $('.runway .channel-' + channel_id + ' .items').html(html);
        this.renderLoadMoreButton(channel_id);
      }
    },
    renderChannelItem: function(item, channel, visible) {
      item.stamp = this.ISODateString(new Date(item.created));
      item.channel = channel;
      item.class = visible ? "item-visible" : "item-hidden";
      item.visible = visible;
      if (item.id && item.image_url) item.image = "/images/" + item.id + ".jpg";
      return ich.channelItem(item, true);
    },
    renderTopStories: function() {
      var html = "";

      for (i in this.channels) {
        html += this.renderChannelItem(this.channels[i].items[0], this.channels[i], true);
      }

      $('.runway .channel-top .items').html(html);
    },
    renderRecentStories: function() {
      var all_items = [];
      var container = $('.runway .channel-recent .items');
      var self = this;
      var visible = true;

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
        container.append(self.renderChannelItem(all_items[i].item, all_items[i].channel, visible));
      }

      this.renderLoadMoreButton("recent");
    },
    renderLoadMoreButton: function(channel_id) {
      var selection = $(".channel-" + channel_id + " .items .item-hidden");

      if (selection.size()) {
        $(".channel-" + channel_id + " .items").append('<div class="loadmore"><a href="#" class="btn" data-channel="' + channel_id + '">Load more</a></div>');
      }
    },
    showChannel: function(channel_id) {
      $('.runway .channel').hide();
      $('.runway .channel-' + channel_id).show();
      $('#nav-channels li').removeClass('active');
      $('#nav-channels li.channel-' + channel_id).addClass('active');
      $('html, body').scrollTop(0);
      this.loadImages(channel_id);
      return false;
    },
    showSpecial: function(name) {
      $('.runway .channel').hide();
      $('.runway .channel-' + name).show();
      $('#nav-channels li').removeClass('active');
      $('#nav-channels li.' + name).addClass('active');
      $('html, body').scrollTop(0);
      this.loadImages(name);
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
      $.getJSON('/ajax/update', {state: this.state}, function(updates) {
        $.each(updates, function(index, value) {
          self.state.channels[value._id] = value.items_added;
          self.updates[index] = value;
          self.showUpdateNotification();
        });
      });
    },
    showUpdateNotification: function() {
      // todo
    },
    hideUpdateNotification: function() {
      // todo
    },
    refreshChannels: function() {
      for (var i in this.updates) {
        this.channels[i] = this.updates[i];
        this.renderChannel(i);
      }
      this.renderTopStories();
      this.renderRecentStories();
      $("abbr.timeago").timeago();
      this.showSpecial('recent');
      this.hideUpdateNotification();
    },
    loadImages: function(channel_id) {
      $(".channel-" + channel_id + " .items .item-visible img").each(function(index, element) {
        $(this).attr("src", $(this).data("src"));
      });
    },
    loadMore: function(channel_id) {
      $(".channel-" + channel_id + " .items .item-hidden").slice(0, this.pager + 1).each(function(index, element) {
        $(this).removeClass("item-hidden").addClass("item-visible");
        var image = $(this).find("img").first();
        image.attr("src", image.data("src"));
      });
    }
  }
  return Pagetty;
});