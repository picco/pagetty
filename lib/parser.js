var _ = require('underscore');
var $ = require('cheerio');
var sanitize = require('validator').sanitize;
var uri = require('url');

var Parser = module.exports = {};

/**
 * TODO
 */
Parser.processHTML = function(baseURL, html, rules, callback) {
  var self = this;
  var start = new Date().getTime();
  var items = [];

  for (i in rules) {
    var rawItems = $(html).find(rules[i].item).toArray();

    for (j in rawItems) {
      var item = self.processItem(baseURL, rawItems[j], rules[i]);

      if (self.itemIsValid(item, items)) {
        items.push(item);
      }
    }
  }
  
  console.log("Parsed: " + baseURL + " items: " + items.length);
  callback(items);
}

Parser.processItem = function(baseURL, raw, rule) {
  var self = this;
  
  var item = {
    title: self.processElement(raw, rule.target.selector, rule.target.title_attribute),
    target: self.processURL(baseURL, self.processElement(raw, rule.target.selector, rule.target.url_attribute)),
    image: self.processURL(baseURL, self.processElement(raw, rule.image.selector, rule.image.attribute)),
    score: self.processScore(self.processElement(raw, rule.score.selector, rule.score.attribute)),
    comments: self.processURL(baseURL, self.processElement(raw, rule.comments.selector, rule.comments.attribute))
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

  // If comments link cannot be found, just point it to target.
  if (item.comments == null) item.comments = item.target;

  // If score is 0, then remove it alltogether.
  if (item.score == null) item.comments = null;

  return item;
}  


/**
 * TODO
 */
Parser.processURL = function(baseURL, url) {
  if (url != null) {
    return uri.resolve(baseURL, encodeURI(url));
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

  if (typeof(selector) == 'undefined') {
    return null;
  }
  else if (attribute) {
    var attributes = attribute.split(",");

    for (var i in attributes) {
      value = $(data).find(selector).first().attr(attributes[i].replace(/^\s+|\s+$/g,""));
      if (value) return this.sanitize(value);
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
  return string ? sanitize(string).entityDecode().trim() : null;
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
