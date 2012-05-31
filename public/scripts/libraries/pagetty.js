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

var JSONDate = (function() {
	function isoDate(r, tz) {
		// log(arguments);
		return fixTimezone(new Date(r[0], r[1] - 1, r[2], r[3], r[4], r[5], r[6] || 0), tz);
	}

	function noop(it) {
		return it;
	}

	function asDate(strValue, tz) {
		return isoDate(strValue.split(/[-T:Z\."]/).filter(noop), tz);
	}

	// date.setHours(date.getUTCHours()); date.setUTCMinutes(date.getUTCMinutes());
	function fixTimezone(date, tz) {
		if (null == tz) {
			tz = date.getTimezoneOffset() / 60 || 0;
		}
		if (tz) {
			date.setHours(date.getHours() - tz);
		}
		return date;
	}
	function isBadDate(d) {
		return String(d) === "Invalid Date"  || String(d.getFullYear()) === "NaN";
	}
	function fromJSON(dstr) {
		var d = Date.create ? Date.create(dstr) : new Date(dstr);
		if (isBadDate(d)) {
			d = asDate(dstr);
		}
		return d;
	}

	return { fromJSON: fromJSON, isInvalidDate:isBadDate, toDate:asDate }
})();

  var Pagetty = {
    channels: {},
    cache: [],
    subscriptions: {},
    activeChannel: false,
    activeVariant: false,
    pager: 9,
    state: {channels: {}},
    updates: [],
    newItemsCount: 0,

    init: function(user, channels) {
      var self = this, navigation = [];
      this.user = user;
      this.subscriptions = user.subscriptions;
      this.storedChannels = amplify.store("channels");

      ich.addTemplate("channelItem", channelItemTemplate);
      ich.addTemplate("channel", channelTemplate);
      ich.addTemplate("channelAll", channelAllTemplate);

      for (channel_id in this.subscriptions) {
        navigation.push({channel_id: channel_id, name: this.subscriptions[channel_id].name});
      }

      navigation.sort(function(a, b) {
        var x = a.name.toLowerCase(), y = b.name.toLowerCase();
        return ( ( x == y ) ? 0 : ( ( x > y ) ? 1 : -1 ) );
      });

      for (var i in navigation) {
        $("#channels .list").append('<li class="channel channel-' + navigation[i].channel_id + '"><a href="#' + navigation[i].channel_id + '" data-channel="' + navigation[i].channel_id + '">' + _.escape(navigation[i].name) + '</a></li>');
      }

      console.log("subscriptions");
      console.dir(this.subscriptions);
      console.log("channels from server");
      console.dir(channels);
      console.log("local sorage channels");
      console.dir(amplify.store("channels"));

      this.channels = this.prepareChannels(this.subscriptions, channels, this.storedChannels);

      console.log("prepared channels");
      console.dir(this.channels);

      for (var channel_id in this.channels) {
        this.state.channels[this.channels[channel_id]._id] = _.clone(this.channels[channel_id].items_added);
      }

      console.log("state");
      console.dir(this.state);

      if (this.storedChannels) {
        this.updateChannels();
      }

      amplify.store("channels", this.channels);

      $(".username").append(_.escape(user.name));

      $("#channels li.channel a").bind("click", function() {
        var channel = $(this).data("channel"), variant = $(this).data("variant");
        //History.pushState({channel: channel, variant: variant}, null, self.channelUrl(channel, variant));
        self.showChannel($(this).data("channel"), $(this).data("variant"));
        return false;
      });

      $(".channel a.variant").live("click", function() {
        var channel = $(this).data("channel"), variant = $(this).data("variant");
        //History.pushState({channel: channel, variant: variant}, null, self.channelUrl(channel, variant));
        self.showChannel($(this).data("channel"), $(this).data("variant"));
        return false;
      });

      $(".more").live("click", function() {
        self.loadMore(Pagetty.activeChannel, Pagetty.activeVariant);
        return false;
      });

      $(".new-stories").live("click", function(e) {
        e.preventDefault();
        self.refreshChannels();
        return false;
      });

      // Sidebar scroll

      $("aside").niceScroll({scrollspeed: 1, mousescrollstep: 40, cursorcolor: "#fafafa", cursorborder: "none", zindex: 1});

      // Act on popstate
/*
      History.Adapter.bind(window, "statechange", function() {
        var stateData = History.getState().data;

        if (stateData.channel) {
          self.showChannel(stateData.channel, stateData.variant);
        }
      });
*/

      // Lazy load additional stories when the page is scrolled near to the bottom.

      $(window).scroll(function() {
        if ($(window).scrollTop() + $(window).height() >= $(document).height() - 100) {
          if ($(window).width() > 960) self.loadMore(self.activeChannel, self.activeVariant);
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
        //History.pushState({channel: channel, variant: variant}, null, this.channelUrl(channel, variant));
      }
      else {
        window.location = "/";
      }

      // Reveal the UI when everything is loaded.
      $(".app .container").show();

    },
    prepareChannels: function(subscriptions, channels, storedChannels) {
      var prepared = {};

      for (var channel_id in subscriptions) {
        var items = [];

        for (var i in channels[channel_id].items) {
          if (storedChannels && storedChannels[channel_id] && storedChannels[channel_id].items) {
            for (var j in storedChannels[channel_id].items) {
              if (channels[channel_id].items[i].id == storedChannels[channel_id].items[j].id) {
                // The the new item as the base.
                var item = _.clone(channels[channel_id].items[i]);
                // We need to rewrite the dates, since Android cannot handle native Date objects propertly.
                item.created = JSONDate.fromJSON(storedChannels[channel_id].items[j].created);
                // We need to keep the isnew status.
                item.isnew = storedChannels[channel_id].items[j].isnew || false;
                // Push to the items array.
                items.push(item);
                // Correct match is found, break the loop.
                break;
              }
            }
            prepared[channel_id] = _.clone(storedChannels[channel_id]);
            prepared[channel_id].items = items;
          }
          else {
            // There's no store, just use all the fresh items.
            prepared[channel_id] = _.clone(channels[channel_id]);
            prepared[channel_id].items = channels[channel_id].items;
          }
        }
      }

      return prepared;
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
          var item = _.clone(this.channels[i].items[j]);
          item.channel = {name: this.subscriptions[i].name, url: this.channels[i].url};
          items.push(item);
        }
      }

      return items;
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
        if (item.id && item.image) item.image_url = "/images/" + item.id + ".jpg";

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
    showChannel: function(channel_id, variant, bustCache) {
      var html = "", cacheKey = "", selector = "", self = this, channel = this.channels[channel_id], subscription = this.subscriptions[channel_id];

      if (!variant) {
        variant = channel_id == "all" ? "time" : "original";
      }

      selector = ".channel-" + channel_id + "-" + variant;
      cacheKey = channel_id + ":" + variant;

      $("#channels .list li.channel-" + channel_id).addClass("loading");
      $(".more").hide();

      if (bustCache) {
        this.cache = [];
        $(".runway .channel").remove();
      }
      else {
        $(".runway .channel").hide();
      }

      if (this.cache[cacheKey]) {
        $(selector).show();
      }
      else {
        if (channel_id == "all") {
          html = self.renderItems(self.sortItems(self.aggregateAllItems(), variant));
        }
        else {
          if (!_.isUndefined(self.channels[channel_id]) && $.isArray(self.channels[channel_id].items) && self.channels[channel_id].items.length) {
            for (i in self.channels[channel_id].items) {
              self.channels[channel_id].items[i].channel = {name: self.subscriptions[channel_id].name, url: self.channels[channel_id].url};
            }
            html = self.renderItems(self.sortItems(self.channels[channel_id].items, variant));
          }
        }

        if (channel_id == "all") {
          $(".runway .inner").append(ich.channelAll({channel: channel, variant: variant, subscription: {name: "All stories"}, items: html}));
        }
        else {
          $(".runway .inner").append(ich.channel({channel: channel, variant: variant, subscription: subscription, items: html}));
        }

        // Time ago.
        $(selector + " abbr.timeago").timeago();

        // Lazy load images.
        $(selector + " .items .show img").each(function() {
          $(this).attr("src", $(this).data("src"));
          $(this).error(function() {$(this).remove()});
        });

        // Add "Load more" button.
        var selection = $(selector + " .items .hide");
        if (selection.size()) {
          $(".more").show();
        }
      }

      $('#channels .list li, a.variant').removeClass('active');
      $('#channels .list li.channel-' + channel_id + ", a.variant." + channel_id + "-" + variant).addClass('active');
      $("#channels .list li.channel-" + channel_id).removeClass("loading");

      if (self.newItems) self.showUpdateNotification();
      this.cache[cacheKey] = true;
      self.activeChannel = channel_id;
      self.activeVariant = variant;
      window.scrollTo(0, 0);

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

      $.getJSON('/update', {state: JSON.stringify(this.state)}, function(updates) {
        if (updates.length) {
          $.each(updates, function(index, value) {
            self.state.channels[value._id] = value.items_added;

            // This function also attaches the "isnew" flag.
            items = self.findNewItems(self, value._id, value.items);
            self.updates[value._id] = items;

            if (index == updates.length - 1) {
              self.newItems = true;
              self.showUpdateNotification();

              console.log("some updates received");
              console.dir(self.updates);
            }
          });
        }
        else {
          console.log("no updates this time");
        }
      });
    },
    findNewItems: function(self, channel_id, items) {
      var count = items.length, found;

      for (var i in items) {
        found = false;

        for (var j in this.channels[channel_id].items) {
          if (self.channels[channel_id].items[j].id == items[i].id) {
            found = true;
            break;
          }
        }

        for (var j in this.updates[channel_id]) {
          if (this.updates[channel_id][j].id == items[i].id) {
            found = true;
            break;
          }
        }

        if (!found) {
          self.newItemsCount++;
          items[i].isnew = true;
        }
      }

      return items;
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

      this.newItems = false;
      this.newItemsCount = 0;
      this.updates = [];
      this.showChannel("all", "time", true);
      amplify.store("channels", this.channels);
      //History.pushState({channel: "all", variant: "time"}, null, this.channelUrl("all", "time"));
      this.hideUpdateNotification();
    },
    showUpdateNotification: function() {
      if (this.newItemsCount > 0) {
        $(".app .runway").addClass("with-messages");
        $(".channel .messages").html('<a class="new-stories" href="#"><i class="icon-refresh"></i> <span class="count">' + this.newItemsCount + ' </span>new stories available. Click here to update.</a>');
      }
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
    loadMore: function(channel_id, variant) {
      var selection = $(".channel-" + channel_id + "-" + variant + " .items .hide");

      if (selection.length) {
        selection.slice(0, this.pager + 1).each(function(index, element) {
          $(this).removeClass("hide").addClass("show");
          var image = $(this).find("img").first();
          image.attr("src", image.data("src"));
        });
      }
      else {
        $(".more").hide();
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
      $("." + (container ? container : "messages")).html("<div class=\"alert alert-error\">" + _.escape(text) + "</div>");
    },
    clearMessages: function() {
      $(".messages").html("");
    }
  }
  return Pagetty;
});