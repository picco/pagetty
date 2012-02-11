(function($) {
  var striimer = {
    state: {channels: {}},
    updates: {},

    init: function(channels) {
      this.channels = channels;
      for (i in this.channels) {
        var channel = this.channels[i];
        this.state.channels[this.channels[i]._id] = this.channels[i].items_added;
        $('#channels').append('<div class="channel"><div class="channel-items channel-items-' + channel._id + '"><a name="#' + channel._id + '"></a></div></div>');
        this.renderChannel(channel._id);
      }
      this.renderTopStories();
      this.renderRecentStories();
      $("abbr.timeago").timeago();
      return this;
    },
    renderChannel: function(channel_id) {
      if ($.isArray(this.channels[channel_id].items) && this.channels[channel_id].items.length) {
        var html = this.renderChannelItems(this.channels[channel_id].items, this.channels[channel_id]);
        $('#channels .channel-items-' + channel_id).html(html);
      }
    },
    renderChannelTitle: function(channel) {
      var html = '<div class="channel-title clearfix" data-channel-id="' + channel._id + '">';
      html += '<h1>' + channel.name + '</h1>';
      html += '</div>';
      return html;
    },
    renderChannelItems: function(items, channel) {
      var html = '';
      for (i in items) {
        html += this.renderChannelItem(items[i], channel);
      }
      return html;
    },
    renderTopStories: function() {
      var html = '';
      for (i in this.channels) {
        html += this.renderChannelItem(this.channels[i].items[0], this.channels[i]);
      }
      $('#channels .channel-items-top').html(html);
    },
    renderRecentStories: function() {
      var all_items = [];
      var container = $('#channels .channel-items-recent');
      var self = this;

      for (i in this.channels) {
        for (j in this.channels[i].items) {
          all_items.push({item: this.channels[i].items[j], channel: this.channels[i]});
        }
      }

      all_items = all_items.sort(function(a, b) {
        return b.item.created - a.item.created;
      });

      $.each(all_items, function(idx, itm) { container.append(self.renderChannelItem(itm.item, itm.channel))});
    },
    renderChannelItem: function(item, channel) {
      var html = '<div class="item item-default"><div class="inner"><div class="details">';
      var youtube_regex = /.+watch\?v=([a-z0-9\-_]+)/gi;
      var youtube_uri = youtube_regex.exec(item.target_uri);

      html += '<a class="site" target="_blank" href="' + channel.uri + '"><strong>' + channel.name + '</strong></a> | ';
      html += '<abbr class="timeago" title="' + this.ISODateString(new Date(item.created)) + '"></abbr>';
      html += '</div>';
      html += '<a target="_blank" href="' + item.target_uri + '">';
      html += '<h2 class="tk-museo">' + item.title + (item.score ? (' <span>(' + item.score + ')</span>') : '') + '</h2></a>';

      if (typeof(youtube_uri) == 'object' && (youtube_uri instanceof Array)) {
        html += '<iframe width="468" height="347" src="http://www.youtube.com/embed/' + youtube_uri[1] + '?wmode=transparent" frameborder="0" allowfullscreen></iframe>';
      } else if (item.image_uri) {
        html += '<a target="_blank" href="' + item.target_uri + '"><img class="lazy media" src="/images/loading.gif" data-original="' + item.image_uri + '" /></a>';
      }

      html += '</div></div>';
      return html;
    },
    showChannel: function(channel_id) {
      $('#nav a').removeClass('active');
      $('#nav a[rel=' + channel_id + ']').addClass('active');
      $('.channel-items').hide();
      $('#context .description').hide();
      $('.channel-items-' + channel_id).show();
      $('#context .description-' + channel_id).show();
      $('.channel-items-' + channel_id + ' img.lazy').lazyload();
      $('html, body').scrollTop(0);
      return false;
    },
    showSpecial: function(name) {
      $('#nav a').removeClass('active');
      $('#nav a.special-' + name).addClass('active');
      $('.channel-items').hide();
      $('.channel-items-' + name).show();
      $('#context .description').hide();
      $('#context .description-' + name).show();
      $('.channel-items-' + name + ' img.lazy').lazyload();
      $('html, body').scrollTop(0);
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
        console.log(self.updates);
        console.log(updates);
      });
    },
    showUpdateNotification: function() {
      $('.update-notification').show();
    },
    hideUpdateNotification: function() {
      $('.update-notification').hide();
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
    }
  }

  $(document).ready(function() {
    striimer.init(channels);

    if (window.location.hash && window.location.hash != '#top') {
      var hash = new String(window.location.hash);
      striimer.showChannel(hash.substring(1));
    }
    else {
      striimer.showSpecial('top');
    }

    $('#nav li a.channel').bind('click', function() {
      striimer.showChannel($(this).attr('rel'));
    });
    $('#nav a.special-top').bind('click', function() {
      striimer.showSpecial('top');
    });
    $('#nav a.special-recent').bind('click', function() {
      striimer.showSpecial('recent');
    });
    $('.refresh-action').bind('click', function() {
      striimer.refreshChannels();
    });

    window.setInterval(function() {
      striimer.updateChannels();
    }, 30000);
  });
})(jQuery);