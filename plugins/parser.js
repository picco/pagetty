exports.attach = function (options) {
  var app = this;
  var _ = require('underscore');
  var $ = require('cheerio');
  var async = require('async');
  var resanitize = require("resanitize");
  var sanitize = require('validator').sanitize;
  var uri = require('url');

  var Parser = {};

  /**
   * TODO
   */
  Parser.processHTML = function(date, channel, html, rules, callback) {
    var self = this;
    var items = [];

    for (i in rules) {
      var rawItems = $(html).find(rules[i].item).toArray();

      for (j in rawItems) {
        var item = self.processItem({
          baseURL: channel.url,
          htmlItem: rawItems[j],
          rule: rules[i],
          date: date,
        });

        item.created = date;

        if (self.itemIsValid(item, items)) {
          items.push(item);
        }
      }
    }

    var title = this.sanitize($(html).find('title').text() || baseURL).trim().substr(0, 50);
    callback(title, items);
  }

  /**
   * Process feedparser articles and convert them into standard items object.
   */
  Parser.processRSS = function(date, baseURL, articles, rule, callback) {
    var self = this;
    var items = [];
    var page = "";

    async.forEach(articles, function(article, next_article) {
      async.waterfall([
        function(next) {
          app.fetch({url: self.processURL(baseURL, article.link)}, function(err, buffer) {
            if (err) console.log(err);
            buffer ? next(null, app.bufferToString(buffer)) : next(null, "");
          });
        },
      ], function(err, page) {
        var item = self.processItem({
          baseURL: baseURL,
          rssItem: article,
          rule: rule,
          date: date,
          page: page
        });

        item.created = date;

        if (self.itemIsValid(item, items)) {
          items.push(item);
        }

        next_article();
      });
    }, function() {
      callback(items);
    });

  }

  Parser.processItem = function(options) {
    var self = this;
    var image_selector = "article p img, .post p img, .content p img, article img, figure img";
    var image_attribute = "src";

    if (options.htmlItem) {
      var item = {
        title: self.processTitle(self.processElement(options.htmlItem, options.rule.title.selector, options.rule.title.attribute)),
        target: self.processURL(options.baseURL, self.processElement(options.htmlItem, options.rule.target.selector, options.rule.target.attribute)),
        image: self.processURL(options.baseURL, self.processElement(options.htmlItem, options.rule.image.selector, options.rule.image.attribute)),
        comments: self.processURL(options.baseURL, self.processElement(options.htmlItem, options.rule.comments.selector, options.rule.comments.attribute)),
        score: self.processScore(self.processElement(options.htmlItem, options.rule.score.selector, options.rule.score.attribute)),
        date: options.date,
      }
    }
    else {
      var item = {
        title: self.processTitle(options.rssItem.title),
        description: options.rssItem.description,
        target: self.processURL(options.baseURL, options.rssItem.origlink || options.rssItem.link),
        comments: self.processURL(options.baseURL, options.rssItem.comments),
        date: options.rssItem.pubdate,
        image: null,
        score: null,
      }

      // There is a chance that RSS parser failed to find the pubDate. Use the currents timestamp instead.
      if (!item.date) item.date = options.date;

      // 1st priority - Scraper rule (only verified image URL's will do)

      if (!item.image && options.rule && options.rule.image.selector) {
        item.image = self.checkImageURL(self.processURL(options.baseURL, self.processElement(options.page, options.rule.image.selector, options.rule.image.attribute)));
      }

      // 2nd priority - OG tag

      if (!item.image) {
        item.image = self.processURL(options.baseURL, self.processElement(options.page, "meta[property='og:image']", "content"));
      }

      // 3rd priority - RSS item image

      if (!item.image && options.rssItem.image.url) {
        item.image = self.processURL(options.baseURL, options.rssItem.image.url);
      }

      // 4th priority - RSS item enclosure

      if (!item.image && options.rssItem.enclosures && options.rssItem.enclosures[0] && options.rssItem.enclosures[0].type == 'image/jpeg') {
        item.image = self.processURL(options.baseURL, options.rssItem.enclosures[0].url);
      }

      // 5th priority - Scraper with a default rule.

      if (!item.image) {
        item.image = self.checkImageURL(self.processURL(options.baseURL, self.processElement(options.page, image_selector, image_attribute)));
      }

      if (options.rule && options.page) {
        item.score = self.processScore(self.processElement(options.page, options.rule.score.selector, options.rule.score.attribute));
      }

      if (!item.comments && options.rule && options.page) {
        item.comments = self.processURL(options.baseURL, self.processElement(options.page, options.rule.comments.selector, options.rule.comments.attribute));
      }
    }

    // If the target is an image, set it also to image url and we can get an instant preview.

    if (item.target) {
      var imageURL = self.checkImageURL(item.target);
      if (imageURL) item.image = imageURL;
    }

    // Image hash is set in syncItems.
    item.image_hash = null;

    // If comments link cannot be found, just point it to target.
    if (item.comments == null) item.comments = item.target;

    // If score is 0, then remove it alltogether.
    // if (item.score == null) item.comments = null;

    return item;
  }

  /**
   * Verify that an URL can be converted to an image.
   */
  Parser.checkImageURL = function(url) {
    var test = new String(url);

    if (test.match(/\.(jpg|jpeg|png|gif)$/gi)) return url;

    var matches = test.match(/^http:\/\/imgur\.com\/([\w\d]+)\/?$/);

    if (matches) {
      return "http://i.imgur.com/" + matches[1] + ".jpg";
    }

    var matches = test.match(/^http:\/\/www.youtube\.com\/watch\?v=([\w\d\-]+)/);

    if (matches) {
      return "http://img.youtube.com/vi/" + matches[1] + "/1.jpg";
    }

    return null;
  }

  /**
   * Sanitize article Title.
   */
  Parser.processTitle = function(title) {
    if (title == null) {
      return null;
    }
    else {
      // Decode HTML entities as described in:
      // http://stackoverflow.com/questions/1147359/how-to-decode-html-entities-using-jquery
      return $("<div/>").html(title.replace(/ +/, ' ')).text();
    }
  }

  /**
   * TODO
   */
  Parser.processURL = function(baseURL, url) {
    if (url != null) {
      if (url.indexOf('http://') == 0 || url.indexOf('https://') == 0) {
        return url;
      }
      else {
        return uri.resolve(baseURL, url);
      }
    }
    else {
      return null;
    }
  }

  /**
   * TODO
   */
  Parser.processElement = function(data, selector, attribute) {
    var value;

    if (!selector) {
      return null;
    }
    else if (attribute) {
      var result = $(data).find(selector);
      var attributes = attribute.split(",");

      for (var i in attributes) {
        var attr = attributes[i].replace(/^\s+|\s+$/g,"");

        if (result.length) {
          value = result.first().attr(attr);

          if (value) {
            if (attr == 'style') {
              var m = value.match(/url\((.+)\)/);
              if (m) return this.sanitize(m[1]);
            }
            else {
              return this.sanitize(value);
            }
          }
        }
        else {
          return null;
        }
      }

      return null;
    }
    else {
      var item = $(data).find(selector).first();
      $(item).find("*").after(" ");
      return this.sanitize($(item).text());
    }
  }

  /**
   * Converts any text string to a numeric score.
   */
  Parser.processScore = function(string) {
    var result = 0;

    if (string) {
      result = string.replace(/[^0-9.]/g, '').trim();

      // Parse scores in the form "1.7k".
      if (string.match(/.*k$/)) result *= 1000;

      return result;
    }
    else {
      return 0;
    }
  }

  /**
   * Chech that the item's target URL is not present already.
   */
  Parser.itemIsValid = function(item, items) {
    if (!item.title) return false;
    if (!item.target) return false;

    for (var i in items) {
      if (items[i].target == item.target) {
        return false;
      }
    }
    return true;
  }

  /**
   * TODO
   */
  Parser.sanitize = function(string) {
    if (string) {
      string = sanitize(string).entityDecode();
      string = sanitize(string).trim();
      return string;
    }
    else {
      return null;
    }
  }

  app.parser = Parser;
}