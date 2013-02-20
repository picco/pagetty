define([
  "underscore",
  "nicescroll",
  "timeago",
  "history",
],function() {

  var Pagetty = {
    init: function(list, lists, variant, new_count) {
      var self = this;

      this.list = list;
      this.lists = lists;
      this.list_loading = false;
      this.list_exhausted = false;
      this.variant = variant;
      this.page = 1;
      this.new_count = new_count;

      self.updateTitle();
      self.showUpdateNotification();
      self.loadImages();

      $('.items article abbr').timeago();
      $(".sidebar .inner").niceScroll({scrollspeed: 1, mousescrollstep: 40, cursorcolor: "#fff", cursorborder: "none", cursoropacitymax: 0});

      $("nav ul a").on("click", function(e) {
        e.preventDefault();
        History.pushState({page: "list", list: $(this).data("list"), variant: "time"}, null, self.listUrl($(this).data("list"), "time"));
        $("nav ul li").removeClass("active");
        $(this).parent().addClass("active");
      });

      $(".notification a").on("click", function(e) {
        e.preventDefault();
        self.update();
      });

      $(".content-width").on("click", function(e) {
        e.preventDefault();
        $(".app").toggleClass("app-wide");
        $.get("/api/app/style/" + ($(".app").hasClass("app-wide") ? 0 : 1));
        window.scrollTo(0, 0);
      });

      $('.tt').tooltip();

      $(document).on("click", "a.variant", function(e) {
        e.preventDefault();
        History.pushState({page: "list", list: $(this).data("list"), variant: $(this).data("variant")}, null, self.listUrl($(this).data("list"), $(this).data("variant")));
      });

      $(window).scroll(function() {
        if ($(window).scrollTop() + $(window).height() >= $(document).height() - 300) {
          self.loadItems();
        }
      });

      $(window).resize(function() {
        window.scrollTo(0, 0);
      });

      window.setInterval(function() {
        self.checkUpdates();
      }, 60000);

      History.Adapter.bind(window, "statechange", function() {
        var stateData = History.getState().data;

        if (stateData.page == "list") {
          self.loadList(stateData.list, stateData.variant);
        }
      });
    },
    loadList: function(list_id, variant) {
      var self = this;

      $.get('/api/list/' + list_id + '/' + variant)
        .success(function(content) {
          self.list = self.lists[list_id];
          self.list_loading = false;
          self.list_exhausted = false;
          self.page = 1;

          $(".content").html(content);
          $('.items article abbr').timeago();

          window.scrollTo(0, 0);
          self.updateTitle();
        }
      );
    },
    loadItems: function() {
      var self = this;

      if (!this.list_exhausted && !this.list_loading) {
        this.list_loading = true;

        $.get('/api/items/' + this.list._id + '/' + this.variant + '/' + this.page)
          .success(function(items) {
            if (items) {
              $('.items').append(items);
              $('.items article abbr').timeago();

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
    loadImages: function() {
      var articles = $("article").toArray();

      for (var i in articles) {
        var a = $(articles[i]);
        var id = a.data("id");
        var ih = a.data("image");
        this.loadImage(id, ih);
      }
    },
    loadImage: function(id, ih) {
      if (ih) {
        $('<img src="/imagecache/' + id + '-' + ih + '.jpg" />').load(function() {
          $("." + id + " .image").append($(this)).show();
        });
      }
    },
    listUrl: function(list_id, variant) {
      var list = this.lists[list_id];

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

      window.scrollTo(0, 0);

      $("nav ul li").removeClass("active");
      $("nav ul li.list-all").addClass("active");

      $.get('/api/update').success(function(data) {
        self.new_count = 0;
        self.loadList("all", "time");
        self.hideUpdateNotification();
      });
    },
    showUpdateNotification: function() {
      if (this.new_count) {
        $('.notification .count').text(this.new_count);
        $('.notification .text').text(this.new_count == 1 ? 'new story' : 'new stories');
        $('.notification').show();
        this.updateTitle();
      }
    },
    hideUpdateNotification: function() {
      $(".notification").hide();
      this.updateTitle();
    },
    updateTitle: function() {
      document.title = (this.new_count ? ("(" + this.new_count + ") ") : "") + this.list.name + " - Pagetty";
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