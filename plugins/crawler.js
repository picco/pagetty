exports.attach = function (options) {
  var app = this;
  var $ = require('cheerio');
  var async = require('async');
  var feedparser = require('feedparser');
  var sanitize = require('validator').sanitize;
  var uri = require('url');

  app.crawler = Crawler = {};

  /**
   * Find all channels that need to be updated and crawl through all of them.
   */
  Crawler.crawlBatch = function(done) {
    var self = this;
    var now = new Date().getTime();
    var check = new Date(now - (app.conf.crawler.channelLifetime * 60 * 1000));
    var updateCount = 0;

    app.log("crawlBatch", "starting new batch (check: " + check + ")");

    var query = {
      subscriptions: {$gt: 0},
      $or: [
        {items_updated: {$exists: false}},
        {items_updated: null},
        {items_updated: {$lt: check}}
      ]
    };

    app.channel.find(query).sort({items_updated: 1}).limit(app.conf.crawler.batchSize).exec(function(err, channels) {
      async.mapSeries(channels, function(channel, next) {
        self.crawl(channel, function() {
          updateCount++;
          next();
        });
      }, function(err) {
        app.log("crawlBatch", "batch completed", "updated channels:", updateCount);
        done(updateCount);
      });
    });
  }

  /**
   * Crawl through single channel.
   */
  Crawler.crawl = function(channel) {
    var self = this;
    var date = new Date();
    var updateScoresFromDate = new Date();
    var items = false;
    var itemsAddedCount = 0;

    // Set the comparision date value to T - 24hours.
    updateScoresFromDate.setDate(updateScoresFromDate.getDate() - 1);

    async.series([
      function(next) {
        // Fetch channel items.
        self.fetchChannelContent(channel, date, function(err, title, channelItems) {
          if (err) app.err("crawl", err);
          items = channelItems;
          next();
        });
      },
      function (next) {
        // Sync all items from feed to database.
        if (items && items.length) {
          async.each(
            items,
            function(item, callback) {
              self.syncItem(channel, item, date, function(count) {
                itemsAddedCount = count;
                callback();
              });
            },
            function(err) {
              next();
            }
          );
        }
      },
      function(next) {
        // Always update the items_updated attribute.
        channel.items_updated = date;
        if (itemsAddedCount) channel.items_added = date;

        channel.save(function(err) {
          if (err) app.err("syncItems", err);
          next();
        });
      },
      function(next) {
        app.rule.findOne({type: "rss", domain: channel.domain}, function(err, rule) {
          if (err) {
            app.err('crawl', err);
            next();
          }
          else if (rule && rule.score.selector) {
            app.item.find({channel_id: channel._id, created: {$gt: updateScoresFromDate}}, function(err, items) {
              async.each(
                items,
                function(item, callback) {
                  self.updateItemScore(channel, item, rule, next);
                },
                function(err) {
                  next();
                }
              );
            });
          }
          else {
            next();
          }
        });
      },
      function(next) {
        self.recalculateRelativeScores(channel, function(err) {
          app.log("crawl", "updated", channel.url, "items:", items ? items.length : 0);
          next();
        });
      }
    ]);
  }

  /**
   * Fetch fresh items for the given channel.
   */
  Crawler.fetchChannelContent = function(channel, date, callback) {
    channel.type == 'rss' ? this.fetchChannelRSS(channel, date, callback) : this.fetchChannelHTML(channel, date, callback);
  }

  /**
   * Fetch fresh items for the given channel.
   */
  Crawler.fetchChannelRSS = function(channel, date, callback) {
    var self = this;

    app.fetch({url: channel.url}, function(err, buffer) {
      if (err) {
        callback(err);
      }
      else {
        feedparser.parseString(app.bufferToString(buffer), function(err, meta, articles) {
          if (err) {
            callback(err);
          } else {
            app.rule.findOne({type: "rss", domain: channel.domain}, function(err, rule) {
              self.processRSS(channel, articles, date, rule, function(items) {
                callback(null, meta.title, items);
              });
            });
          }
        });
      }
    });
  }

  /**
   * Fetch fresh items for the given channel.
   */
  Crawler.fetchChannelHTML = function(channel, date, callback) {
    var self = this;
    var params = [];

    async.waterfall([
      function(next) {
        app.fetch({url: channel.url}, function(err, buffer) {
          buffer ? next(err, app.bufferToString(buffer)) : next("Unable to download from: " + channel.url);
        });
      },
      function(body, next) {
        app.rule.find({$or: [{url: channel.url}, {domain: channel.domain}]}, function(err, rules) {
          next(err, body, rules);
        });
      },
      function(body, rules, next) {
        app.parser.processHTML(date, channel, body, rules, function(title, items) {
          params.title = title;
          params.items = items;
          next();
        });
      },
    ], function(err) {
      callback(err, params.title, params.items);
    });
  }

  /**
   * Process feedparser articles and convert them into standard items object.
   */
  Crawler.processRSS = function(channel, articles, date, rule, callback) {
    var self = this;
    var items = [];

    async.each(articles, function(article, next_article) {
      var page = null;

      var item = {
        title: self.processTitle(article.title),
        description: article.description,
        target: self.processURL(channel.url, article.origlink || article.link),
        comments: self.processURL(channel.url, article.comments),
        date: article.pubdate || date,
        image: null,
        score: null,
      }

      async.series([
        function(next) {
          app.item.findOne({channel_id: channel._id, target: item.target}, function(err, currentItem) {
            if (currentItem) {
              // Fetch page content only for new articles.
              next();
            }
            else {
              app.fetch({url: item.target}, function(err, buffer) {
                if (err) {
                  app.err("processRSSItems", err);
                }
                else {
                  page = self.filterHTML(app.bufferToString(buffer));
                }

                next();
              });
            }
          });
        },
        function (next) {
          item = self.buildItem(item, article, page, rule, channel);
          next();
        }
      ], function(err) {
        items.push(item);
        next_article();
      });
    }, function() {
      callback(items);
    });
  }

  /**
   * TODO
   */
  Crawler.processHTML = function(date, channel, html, rules, callback) {
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

        if (self.itemIsUnique(item, items)) {
          items.push(item);
        }
      }
    }

    var title = this.filterText($(html).find('title').text() || channel.url).trim().substr(0, 50);
    callback(title, items);
  }

  Crawler.buildItem = function(item, rssItem, page, rule, channel) {
    var self = this;
    var image_selector = "article p img, .post p img, .content p img, article img, figure img";
    var image_attribute = "src";

    /*
    if (options.htmlItem) {
      var item_x = {
        title: self.processTitle(self.scrape(options.htmlItem, options.rule.title.selector, options.rule.title.attribute)),
        target: self.processURL(options.baseURL, self.scrape(options.htmlItem, options.rule.target.selector, options.rule.target.attribute)),
        image: self.processURL(options.baseURL, self.scrape(options.htmlItem, options.rule.image.selector, options.rule.image.attribute)),
        comments: self.processURL(options.baseURL, self.scrape(options.htmlItem, options.rule.comments.selector, options.rule.comments.attribute)),
        score: self.processScore(self.scrape(options.htmlItem, options.rule.score.selector, options.rule.score.attribute)),
        date: options.date,
      }
    }
    */

    // 1st priority image - Page image via scraper rule (only verified image URL's will do)

    if (!item.image && page && rule && rule.image.selector) {
      item.image = self.filterImageURL(self.processURL(channel.url, self.scrape(page, rule.image.selector, rule.image.attribute)));
    }

    // 2nd priority - Page OG tag

    if (!item.image && page) {
      item.image = self.processURL(channel.url, self.scrape(page, "meta[property='og:image']", "content"));
    }

    // 3rd priority - RSS item image

    if (!item.image && rssItem && rssItem.image.url) {
      item.image = self.processURL(channel.url, rssItem.image.url);
    }

    // 4th priority - RSS item enclosure

    if (!item.image && rssItem && rssItem.enclosures && rssItem.enclosures[0] && rssItem.enclosures[0].type == 'image/jpeg') {
      item.image = self.processURL(channel.url, rssItem.enclosures[0].url);
    }

    // 5th priority image - Scraper with a default rule.

    if (!item.image && page) {
      item.image = self.filterImageURL(self.processURL(channel.url, self.scrape(page, image_selector, image_attribute)));
    }

    if (page && rule) {
      item.score = self.processScore(self.scrape(page, rule.score.selector, rule.score.attribute));
    }

    if (page && rule) {
      item.comments = self.processURL(channel.url, self.scrape(page, rule.comments.selector, rule.comments.attribute));
    }

    // If the target is an image, set it also to image url and we can get an instant preview.

    if (item.target) {
      var imageURL = self.filterImageURL(item.target);
      if (imageURL) item.image = imageURL;
    }

    // If comments link cannot be found, just point it to target.
    if (item.comments == null) item.comments = item.target;

    return item;
  }

  /**
   * Sync a single channel item data.
   */
  Crawler.syncItem = function(channel, new_item, date, callback) {
    var self = this;
    var hasChanges = false;
    var itemsAddedCount = 0;

    async.waterfall([
      function(next) {
        app.item.findOne({channel_id: channel._id, target: new_item.target}, function(err, doc) {
          if (err) app.err("syncItem", err);
          next(null, doc);
        });
      },
      function(current_item, next) {
        if (current_item) {
          if (current_item.title != (new_item.title || current_item.title)) {
            app.log("Title", current_item.title, ":", new_item.title);
            current_item.title = hasChanges = (new_item.title || current_item.title);
          }

          if (current_item.description != (new_item.description || current_item.description)) {
            app.log("Description", current_item.description, ":", new_item.description);
            current_item.description = hasChanges = (new_item.description || current_item.description);
          }

          if (current_item.image != (new_item.image || current_item.image)) {
            app.log("Image", current_item.image, ":", new_item.image);
            current_item.image = hasChanges = (new_item.image || current_item.image);
          }

          if (current_item.comments != (new_item.comments || current_item.comments)) {
            app.log("Comments", current_item.comments, ":", new_item.comments);
            current_item.comments = hasChanges = (new_item.comments || current_item.comments);
          }

          if (current_item.score != (new_item.score || current_item.score)) {
            app.log("Score", current_item.score, ":", new_item.score);
            current_item.score = hasChanges = (new_item.score || current_item.score);
          }

          if (current_item.date.toString() != new_item.date.toString()) {
            app.log("Date", current_item.date, ":", new_item.date);
            current_item.date = hasChanges = (new_item.date || current_item.date);
          }

          if (hasChanges === false) {
            app.log("Up to date", current_item.target);
            next();
          }
          else if (current_item.title && current_item.target) {
            app.log("Updating current", current_item.target);
            current_item.save(function(err) {
              if (err) app.err("syncItem", err);
              next();
            });
          }
          else {
            app.log("Incomplete item");
            next();
          }
        }
        else {
          new_item.channel_id = channel._id;
          new_item.created = date;

          if (new_item.title && new_item.target) {
            app.log("Creating new", new_item.target);

            itemsAddedCount++;
            app.item.create(new_item, function(err) {
              if (err) app.err("syncItem", err);
              next();
            });
          }
          else {
            app.err("Incomplete new item");
            next();
          }
        }
      }
    ],
    function(err) {
      callback(itemsAddedCount);
    });
  }

  /**
   * Scrape the score value from the article page.
   */
  Crawler.updateItemScore = function(item, channel, rule, callback) {
    var self = this;
    var page = null;

    async.series([
        function(next) {
        app.fetch({url: item.target}, function(err, buffer) {
          if (err) {
            app.err('updateItemScore', err);
          }
          else {
            page = self.filterHTML(app.bufferToString(buffer));
            next(page ? null : true);
          }
        });
      },
      function(next) {
        item.score = self.processScore(self.scrape(page, rule.score.selector, rule.score.attribute));
        item.save(function(err) {
          if (err) app.err('updateItemScore', err);
          next();
        });
      }
    ], function(err) {
      callback();
    });
  }

  /**
   * Recalculate relative scores for all items.
   */
  Crawler.recalculateRelativeScores = function(channel, callback) {
    var self = this;
    var min = 0;
    var max = 0;
    var rel = 0;

    async.waterfall([
      // Find max score
      function(next) {
        app.item.find({channel_id: channel._id}).sort({score: -1}).limit(1).exec(function(err, items) {
          max = items[0] ? parseFloat(items[0].score) : 0;
          next();
        });
      },
      // Recalculate scores
      function(next) {
        app.item.find({channel_id: channel._id}, function(err, items) {
          async.forEach(items, function(item, cb) {
            rel = new Number((item.score - min) / (max - min)).toPrecision(4);
            item.relative_score = (rel == "NaN" || rel == "Infinity") ? 0 : rel;
            item.save(function(err) {
              if (err) app.err("recalculateRelativeScores", err);
              cb();
            });
          }, function() {
            next();
          });
        });
      },
    ], function(err) {
      callback();
    });
  }

  /**
   * Sanitize article Title.
   */
  Crawler.processTitle = function(title) {
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
  Crawler.processURL = function(baseURL, url) {
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
   * Converts any text string to a numeric score.
   */
  Crawler.processScore = function(string) {
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
   * TODO
   */
  Crawler.scrape = function(data, selector, attribute) {
    var value;

    if (!selector) {
      return null;
    }
    else if (data.length > 1048576) {
      return null;
    }
    else if (attribute) {
      try {
        var result = $(data).find(selector);
      }
      catch (e) {
        return null;
      }

      var attributes = attribute.split(",");

      for (var i in attributes) {
        var attr = attributes[i].replace(/^\s+|\s+$/g,"");

        if (result.length) {
          value = result.first().attr(attr);

          if (value) {
            if (attr == 'style') {
              var m = value.match(/url\((.+)\)/);
              if (m) return this.filterText(m[1]);
            }
            else {
              return this.filterText(value);
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
      return this.filterText($(item).text());
    }
  }

  /**
   * Pass content throgh only if HTML.
   */
  Crawler.filterHTML = function(data) {
    return data.match(/<html|<head|<body/gi) ? data : '';
  }

  /**
   * TODO
   */
  Crawler.filterText = function(string) {
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
   * Verify that an URL can be converted to an image.
   */
  Crawler.filterImageURL = function(url) {
    var test = new String(url);

    if (test.match(/\.(jpg|jpeg|png|gif)(\?.+)*$/gi)) return url;

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
   * Check that the item's target URL is not present already.
   */
  Crawler.itemIsUnique = function(item, items) {
    for (var i in items) {
      if (items[i].target == item.target) {
        return false;
      }
    }
    return true;
  }
}
