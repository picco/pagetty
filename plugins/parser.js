exports.attach = function (options) {
  var app = this;
  var _ = require('underscore');
  var $ = require('cheerio');
  var async = require('async');
  var sanitize = require('validator').sanitize;
  var uri = require('url');

  var Parser = {};

  /**
   * TODO
   */
  Parser.processHTML = function(date, channel, html, rules, callback) {
    var self = this;
    var items = [];
    var pos = 1;

    for (i in rules) {
      var rawItems = $(html).find(rules[i].item).toArray();

      for (j in rawItems) {
        var item = self.processItem({
          baseURL: channel.url,
          htmlItem: rawItems[j],
          rule: rules[i],
          date: date,
        });

        item.pos = pos++;
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
    var pos = 1;

    async.forEach(articles, function(article, next_article) {
      async.waterfall([
        function(next) {
          if (rule && (rule.image.mode == "page" || rule.score.mode == "page" || rule.comments.mode == "page")) {
            app.fetch({url: self.processURL(baseURL, article.link)}, function(err, buffer) {
              buffer ? next(null, buffer.toString()) : next(null, "");
            });
          }
          else {
            next(null, "");
          }
        },
      ], function(err, page) {
        var item = self.processItem({
          baseURL: baseURL,
          rssItem: article,
          rule: rule,
          page: page
        });

        item.pos = pos++;
        item.created = date;
        items.push(item);
        next_article();
      });
    }, function() {
      callback(items);
    });

  }

  Parser.processItem = function(options) {
    var self = this;

    if (options.htmlItem) {
      var item = {
        title: self.processTitle(self.processElement(options.htmlItem, options.rule.title.selector, options.rule.title.attribute)),
        target: self.processURL(options.baseURL, self.processElement(options.htmlItem, options.rule.target.selector, options.rule.target.attribute)),
        image: self.processURL(options.baseURL, self.processElement(options.htmlItem, options.rule.image.selector, options.rule.image.attribute)),
        comments: self.processURL(options.baseURL, self.processElement(options.htmlItem, options.rule.comments.selector, options.rule.comments.attribute)),
        score: self.processScore(self.processElement(options.htmlItem, options.rule.score.selector, options.rule.score.attribute)),
        rule: options.rule._id,
        date: options.date,
      }
    }
    else {
      var item = {
        title: self.processTitle(options.rssItem.title),
        target: self.processURL(options.baseURL, options.rssItem.link),
        comments: self.processURL(options.baseURL, options.rssItem.comments),
        date: options.rssItem.date,
        image: null,
        score: null,
        rule: null,
      }

      if (options.rssItem.image.url) {
        item.image = self.processURL(options.baseURL, options.rssItem.image.url);
      }
      else if (options.rssItem.enclosures && options.rssItem.enclosures[0] && options.rssItem.enclosures[0].type == 'image/jpeg') {
        item.image = self.processURL(options.baseURL, options.rssItem.enclosures[0].url);
      }
      else {
        item.image = self.processURL(options.baseURL, self.processElement(options.rssItem.description, 'img', 'src'));
      }

      if (!item.image && options.rule && options.page) {
        item.image = self.processURL(options.baseURL, self.processElement(options.page, options.rule.image.selector, options.rule.image.attribute));
      }

      if (options.rule && options.page) {
        item.score = self.processScore(self.processElement(options.page, options.rule.score.selector, options.rule.score.attribute));
      }

      if (!item.comments && options.rule && options.page) {
        item.comments = self.processURL(options.baseURL, self.processElement(options.page, options.rule.comments.selector, options.rule.comments.attribute));
      }
    }

    // If the target is an image, set it also to image url and we can get an instant preview.
    if (item.target && item.target.match(/\.(jpg|png|gif)$/gi)) item.image = item.target;

    // Preview imgur images automatically.
    if (item.target) {
      var matches = item.target.match(/^http:\/\/imgur\.com\/([\w\d]+)\/?$/);
      if (matches) {
        item.image = "http://i.imgur.com/" + matches[1] + ".jpg";
      }
    }

    // Create thumbails for YouTube
    if (item.target) {
      var matches = item.target.match(/^http:\/\/www.youtube\.com\/watch\?v=([\w\d\-]+)/);
      if (matches) {
        item.image = "http://img.youtube.com/vi/" + matches[1] + "/1.jpg";
      }
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
   * TODO
   */
  Parser.processTitle = function(title) {
    return title == null ? null : title.replace(/ +/, ' ');
  }

  /**
   * TODO
   */
  Parser.processURL = function(baseURL, url) {
    if (url != null) {
      return uri.resolve(baseURL, url);
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
    if (string) {
      return string.replace(/[^0-9.]/g, '');
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

  /**
   * Calculate the relative scores of all items on a channel.
   */
  Parser.calculateRelativeScore = function(items) {
    var min = null, max = 0, score = 0;

    for (i in items) {
      score = parseFloat(items[i].score);
      if (score >= max) max = score;

      if (min == null) {
        if (score > 0) min = score;
      }
      else {
        if (score < min) min = score;
      }
    }

    if (min == null) min = 0;

    for (i in items) {
      score = parseFloat(items[i].score);
      score = new Number((score - min) / (max - min)).toPrecision(4);
      items[i].relative_score = (score == "NaN") ? 0 : score;
    }

    return items;
  }

  app.parser = Parser;
}