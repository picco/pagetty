var
$          = require("jquery");
fs         = require("fs");
logger     = require(__dirname + "/logger.js");
sanitize   = require("validator").sanitize;
select     = require("cheerio-soupselect").select;
uri        = require("url");

Parser = {}

Parser.process = function(html, channel, rules, callback) {
  var items = [], self = this, start = new Date().getTime();

  for (i in rules) {
    var rawItems = $(html).find(rules[i].item).toArray();

    for (j in rawItems) {
      var item = this.processItem(rawItems[j], channel, rules[i]);

      if (this.itemIsValid(item, items)) {
        items.push(item);
      }
    }
  }
  logger.log.info("Parsed: " + channel.url + " items: " + items.length + ", time: " + self.timer(start) + "ms");
  callback(items);
}

Parser.processItem = function(raw, channel, rule) {
  var item = {
    title: this.processElement(raw, rule.target.selector, rule.target.title_attribute),
    target: this.processURL(this.processElement(raw, rule.target.selector, rule.target.url_attribute), channel),
    image: this.processURL(this.processElement(raw, rule.image.selector, rule.image.attribute), channel),
    score: this.processScore(this.processElement(raw, rule.score.selector, rule.score.attribute)),
    comments: this.processURL(this.processElement(raw, rule.comments.selector, rule.comments.attribute), channel)
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

Parser.processElement = function(data, selector, attribute) {
  var value;

  if (typeof(selector) == 'undefined') {
    return null;
  }
  else if (attribute) {
    var attributes = attribute.split(",");

    for (var i in attributes) {
      value = $(data).find(selector).first().attr($.trim(attributes[i]));
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

Parser.processURL = function(url, channel) {
  if (url != null) {
    return uri.resolve(channel.url, encodeURI(url));
  }
  else {
    return null;
  }
}

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

Parser.timer = function(start) {
  var end = new Date().getTime();
  return Math.floor(end - start);
}

process.on("message", function(m) {
  Parser.process(m.html, m.channel, m.rules, function(items) {
    process.send(items);
  });
});