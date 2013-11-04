define([],function() {
  var Pagetty = {
    init: function(list_id, lists, variant, new_count, list_template, list_items_template, preview_items_template) {
      var self = this;

      this.cache = {};
      this.list_id = list_id;
      this.lists = lists;
      this.list_loading = false;
      this.list_exhausted = false;
      this.variant = variant;
      this.page = 1;
      this.new_count = new_count;
      this.title = "Pagetty Reader";
      this.preview_pos = -1;

      this.sly_opts = {
        speed: 50,
        scrollBy: 100,
      }

      this.sidebar_slider = new Sly('.sidebar', this.sly_opts).init();
      this.list_slider = new Sly('.list', this.sly_opts).init();
      this.preview_slider = new Sly('.preview', this.sly_opts).init();

      this.renderList = Handlebars.compile(list_template);
      this.renderListItems = Handlebars.compile(list_items_template);
      this.renderPreviewItems = Handlebars.compile(preview_items_template);

      // Cancel all in-progress requests before making a new one.
      // http://stackoverflow.com/questions/1802936/stop-all-active-ajax-requests-in-jquery

      $.xhrPool = [];
      $.xhrPool.abortAll = function() {
          $(this).each(function(idx, jqXHR) {
              jqXHR.abort();
          });
          $.xhrPool.length = 0
      };

      $.ajaxSetup({
          beforeSend: function(jqXHR) {
              $.xhrPool.push(jqXHR);
          },
          complete: function(jqXHR) {
              var index = $.xhrPool.indexOf(jqXHR);
              if (index > -1) {
                  $.xhrPool.splice(index, 1);
              }
          }
      });

      Handlebars.registerHelper("eq", function(v1, v2, options) {
        var a = new String(v1);
        var b = new String(v2);
        return (a.toString() == b.toString()) ? options.fn(this) : options.inverse(this);
      });

      Handlebars.registerHelper("neq", function(v1, v2, options) {
        return (v1 != v2) ? options.fn(this) : options.inverse(this);
      });

      Handlebars.registerHelper("property", function(obj, key, options) {
        return obj[key];
      });

      self.showUpdateNotification();

      $("nav ul a").on("mousedown", function(e) {
        e.preventDefault();
        History.pushState({page: "list", list: $(this).data("list"), variant: "time"}, self.title, self.listUrl($(this).data("list"), "time"));
      });

      $("nav ul a").on("click", function(e) {
        return false;
      });

      $(".notification a").on("click", function(e) {
        e.preventDefault();
        self.update();
      });

      $(".prev").on("click", function(e) {
        e.preventDefault();
        self.prevItem();
      });

      $(".next").on("click", function(e) {
        e.preventDefault();
        self.nextItem();
      });

      $(document).on("click", "a.variant", function(e) {
        e.preventDefault();
        History.pushState({page: "list", list: $(this).data("list"), variant: $(this).data("variant")}, self.title, self.listUrl($(this).data("list"), $(this).data("variant")));
      });

      $("form.search").on("submit", function(e) {
        var query = $("form.search input").val();
        e.preventDefault();
        if (query) History.pushState({page: "list", list: "search", variant: query}, self.title, self.listUrl("search", query));
      });

      $(document).on("click", ".action-move-new", function(e) {
        e.preventDefault();

        var name = prompt("Enter folder name");

        if (name) {
          window.location = "/list/move/" + self.list_id + "/new/" + name;
        }
      });

      $(document).on("click", ".action-rename", function(e) {
        e.preventDefault();

        var name = prompt("Enter a new name");

        if (name) {
          window.location = "/list/rename/" + self.list_id + "/" + name;
        }
      });

      $(document).on("click", ".action-delete", function(e) {
        e.preventDefault();

        if (confirm("Are you sure you want to delete this folder?\nAll feeds in this folder will be moved to the root level.")) {
          window.location = "/list/remove/" + self.list_id;
        }
      });

      $(document).on("click", ".list article .title", function(e) {
        if (e.target.nodeName.toLowerCase() != "a") {
          e.preventDefault();

          self.preview_slider.reload();

          var top = $('.preview .slidee').scrollTop();
          var pos = parseInt($('.preview .' + $(this).parent().data('id')).offset().top - top);
          var value = parseInt(Math.abs($('.preview .slidee').offset().top) + pos);

          self.preview_slider.slideTo(value == 40 ? 0 : value, true);
          self.updateUI();
        }
      });

      $(document).on("click", ".preview article .title", function(e) {
        if (e.target.nodeName.toLowerCase() != "a") {
          e.preventDefault();

          var top = $('.list .slidee').scrollTop();
          var pos = parseInt($('.list .' + $(this).parent().parent().data('id')).offset().top - top);

          self.list_slider.slideTo(Math.abs($('.list .slidee').offset().top) + pos, true);
          self.updateUI();
        }
      });

      $(window).on("keypress", function(e) {
        if (e.target.nodeName.toLowerCase() != "input") {
          if (e.keyCode == 106) {
            self.nextItem();
          }
          else if (e.keyCode == 107) {
            self.prevItem();
          }
        }
      });

      $(window).resize(function() {
        self.sidebar_slider.reload();
        self.list_slider.reload();
        self.preview_slider.reload();
      });

      window.setInterval(function() {
        self.updateUI();
      }, 500);

      window.setInterval(function() {
        self.checkUpdates();
      }, 60000);

      History.Adapter.bind(window, "statechange", function() {
        var stateData = History.getState().data;

        if (stateData.page == "list") {
          self.loadList(stateData.list, stateData.variant);
        }
      });

      self.loadList(this.list_id, this.variant);
    },
    loadList: function(list_id, variant) {
      var self = this;

      $.xhrPool.abortAll();

      self.list_id = list_id;
      self.variant = variant;
      self.list_loading = false;
      self.list_exhausted = false;
      self.page = 1;

      self.updateTitle();

      $("nav ul li").removeClass("active open");
      $("nav ul li.list-" + list_id).addClass("active");

      if ($("nav ul li.list-" + list_id).hasClass("directory")) {
        $("nav ul li.list-" + list_id).addClass("open");
      }
      else {
        $("nav ul li.list-" + list_id).parents("li.directory").addClass("open");
      }

      $("form.search input").val(list_id == "search" ? variant : "");

      $(".content").html(self.renderList({
        list: self.lists[self.list_id],
      }));

      $.getJSON('/api/items/' + list_id + '/' + variant + '/0').success(function(data, status, xhr) {
        console.dir(data);
        $('.list .items').html(self.renderListItems(data));
        $('.preview .slidee').html(self.renderPreviewItems(data));

        self.timeAgo();
        self.makeScrollable();
        self.preview_pos = -1;
      });
    },
    loadItems: function() {
      var self = this;

      if (!this.list_exhausted && !this.list_loading) {
        this.list_loading = true;

        $.get('/api/items/' + this.list_id + '/' + this.variant + '/' + this.page)
          .success(function(data) {
            if (data) {
              $('.list .items').append(self.renderListItems(data));
              $('.preview .slidee').append(self.renderPreviewItems(data));

              self.timeAgo();
              self.list_slider.reload();
              self.preview_slider.reload();
              self.list_loading = false;
              self.page++;
            }
            else {
              self.list_loading = false;
              self.list_exhausted = true;
            }
          })
          .error(function() {
            self.list_loading = false;
            self.list_exhausted = true;
          });
      }
    },
    updateUI: function() {
      var self = this;
      var preview_pos = Math.abs($('.preview .slidee').offset().top);
      var treshold = 1000;

      if (self.preview_pos != preview_pos) {
        self.preview_pos = preview_pos;

        $('.preview article').each(function(index, article) {
          if ($(article).offset().top > -40 && $(article).offset().top < self.preview_slider.rel.frameSize + treshold) {
            $(article).find('img.lazy').not('.loaded').each(function(index, article_image) {
              self.loadImage(article_image);
            });
          }
        });

        self.preview_slider.reload();
      }
    },
    loadImage: function(image) {
      $(image).addClass('loaded').attr('src', $(image).data('original'));
    },
    makeScrollable: function() {
      this.list_slider.destroy();
      this.list_slider = new Sly('.list', this.sly_opts).init();

      this.list_slider.on('change', function () {
        if (this.pos.dest > this.pos.end - 300) {
          Pagetty.loadItems();
        }
      });

      this.preview_slider.destroy();
      this.preview_slider = new Sly('.preview', this.sly_opts).init();
      this.preview_slider.reload();

      this.preview_slider.on('change', function () {
        if (this.pos.dest > this.pos.end - 300) {
          Pagetty.loadItems();
        }
      });
    },
    timeAgo: function() {
      $('article .timeago').each(function() {
        $(this).html(moment($(this).data("stamp")).fromNow());
      });
    },
    listUrl: function(list_id, variant) {
      if (list_id == "all") {
        if (!variant || variant == "time") {
          return "/"
        }
        else {
          return "/list/" + list_id + "/" + variant;
        }
      }
      else {
        return "/list/" + list_id + ((!variant || variant == "time") ? "" : ("/" + variant));
      }
    },
    checkUpdates: function() {
      var self = this;

      $.getJSON('/api/items/new').success(function(data) {
        self.new_count = data.count;
        self.showUpdateNotification();
      });
    },
    update: function() {
      var self = this;

      $("nav ul li").removeClass("active");
      $("nav ul li.list-all").addClass("active");

      $.getJSON('/api/update').success(function(data) {
        self.new_count = 0;
        self.loadList("all", "time");
        self.hideUpdateNotification();
        self.updateFreshCounts(data);
      });
    },
    updateFreshCounts: function(counts) {
      var self = this;
      _.each(this.lists, function(list) { $("nav li.list-" + list._id + " span").text(self.formatFreshCount(counts[list._id])); });
      $("nav li.list-all span").text(self.formatFreshCount(counts["total"]));
    },
    formatFreshCount: function(number) {
      return number ? ("+" + number) : "";
    },
    updateTitle: function() {
      document.title = "Pagetty Reader" + (this.new_count ? (" (" + this.new_count + ")") : "");
    },
    showUpdateNotification: function() {
      if (this.new_count) {
        $('.notification .count').text(this.new_count);
        $('.notification .text').text(this.new_count == 1 ? 'new article' : 'new articles');
        $('.notification').show();
        this.updateTitle();
      }
    },
    nextItem: function() {
      var self = this;
      var top = $('.preview .slidee').scrollTop();

      $('.preview article').each(function(index, article) {
        var pos = parseInt($(article).offset().top - top);

        if (pos > 20){
          self.preview_slider.slideTo(Math.abs($('.preview .slidee').offset().top) + pos, true);
          return false;
        }
      });
    },
    prevItem: function() {
      var self = this;
      var top = $('.preview .slidee').scrollTop();

      $($('.preview article').get().reverse()).each(function(index, article) {
        var pos = parseInt($(article).offset().top - top);

        if (pos < 0){
          self.preview_slider.slideTo(Math.abs($('.preview .slidee').offset().top) + pos, true);
          return false;
        }
      });
    },
    hideUpdateNotification: function() {
      $(".notification").hide();
      this.updateTitle();
    },
    success: function(text, container) {
      var selector = "." + (container ? container : "messages");

      this.hideProgress();

      $(selector).animate({opacity: 0}, 100, function() {
        $(selector).css('opacity', 1).html("<div class=\"alert alert-success\">" + _.escape(text) + "</div>");
      });

    },
    error: function(text, container) {
      var selector = "." + (container ? container : "messages");

      this.hideProgress();

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