define([
  "underscore",
  "nicescroll",
  "timeago",
  "history",
],function() {

  var Pagetty = {
    init: function(list_id, lists, variant, new_count) {
      var self = this;

      this.list_id = list_id;
      this.lists = lists;
      this.list_loading = false;
      this.list_exhausted = false;
      this.variant = variant;
      this.page = 1;
      this.new_count = new_count;
      this.title = "Pagetty Reader";

      //var el = $("nav ul li.list-" + this.list_id);

      //$(el).addClass("active");
      //$(el).hasClass("directory") ? $(el).addClass("open") : $(el).parents("li.directory").addClass("open");

      self.showUpdateNotification();
      self.loadImages();
      self.setHeight();

      $('.items article abbr').timeago();
      $(".sidebar .inner").niceScroll({scrollspeed: 1, mousescrollstep: 40, cursorcolor: "#fff", cursorborder: "none", cursoropacitymax: 0});

      $("nav ul a").on("click", function(e) {
        e.preventDefault();
        History.pushState({page: "list", list: $(this).data("list"), variant: "time"}, self.title, self.listUrl($(this).data("list"), "time"));
        window.scrollTo(0, 0);
      });

      $(".notification a").on("click", function(e) {
        e.preventDefault();
        self.update();
      });

      $(".content-width").on("click", function(e) {
        e.preventDefault();
        self.toggleStyle();
        window.scrollTo(0, 0);
      });

      //$('.tt').tooltip();

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

      $(document).on("contextmenu", "article", function(e) {
        e.preventDefault();
        self.toggleStyle();
        $('html, body').scrollTop($(this).offset().top);
      });

      $(window).scroll(function() {
        if ($(window).scrollTop() + $(window).height() >= $(document).height() - 300) {
          self.loadItems();
        }
      });

      $(window).resize(function() {
        self.setHeight();
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

      $("nav ul li").removeClass("active open");
      $("nav ul li.list-" + list_id).addClass("active");

      if ($("nav ul li.list-" + list_id).hasClass("directory")) {
        $("nav ul li.list-" + list_id).addClass("open");
      }
      else {
        $("nav ul li.list-" + list_id).parents("li.directory").addClass("open");
      }

      $("section.list").css("opacity", .4);

      $("form.search input").val(list_id == "search" ? variant : "");

      $.get('/api/list/' + list_id + '/' + variant)
        .success(function(content) {
          self.list_id = list_id;
          self.variant = variant;
          self.list_loading = false;
          self.list_exhausted = false;
          self.page = 1;

          $(".content").html(content);
          $('.items article abbr').timeago();

          window.scrollTo(0, 0);
          self.updateTitle();
          self.loadImages();
          self.setHeight();
        }
      );
    },
    loadItems: function() {
      var self = this;

      if (!this.list_exhausted && !this.list_loading) {
        this.list_loading = true;

        $.get('/api/items/' + this.list_id + '/' + this.variant + '/' + this.page)
          .success(function(items) {
            if (items) {
              $('.items').append(items);
              $('.items article abbr').timeago();

              self.loadImages();
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
      var articles = $("article.load").toArray();

      for (var i in articles) {
        var a = $(articles[i]);
        var id = a.data("id");
        var ih = a.data("image");
        this.loadImage(id, ih);
      }
    },
    loadImage: function(id, ih) {
      if (ih) {
        var img = new Image();
        img.src = "/imagecache/" + id + "-" + ih + ".jpg";
        img.onload = function() {
          $("." + id + " .image").html($(img)).removeClass("disabled").parents("article").removeClass("load");
        }
      }
      else {
        $("." + id + " .image").parents("article").removeClass("load");
      }
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

      window.scrollTo(0, 0);

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
    setHeight: function() {
      $("section.list").css("min-height", $(window).height());
    },
    toggleStyle: function() {
      $(".app").toggleClass("app-wide");
      $.get("/api/app/style/" + ($(".app").hasClass("app-wide") ? 0 : 1));
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