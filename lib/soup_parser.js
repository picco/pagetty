var
fs         = require("fs");
htmlparser = require("htmlparser"),
logger     = require(__dirname + "/logger.js");
sanitize   = require("validator").sanitize;
select     = require("cheerio-soupselect").select;

// include URL.js library
eval(fs.readFileSync(__dirname + "/url.js").toString());

Parser = {}

Parser.process = function(html, channel, rules, callback) {
  var self = this;
  var start = new Date().getTime();

  this.items = [];
  this.handler = new htmlparser.DefaultHandler(function (err, dom) {
    if (err) {
      logger.log.error("Parser exception for:" + channel.url + ": " + err);
      callback(false);
    }
    else {
      for (i in profile.rules) {
        var elements = select(dom, profile.rules[i].item);
        for (j in elements) {
          var element = elements[j];
          var item = self.processItem(element, channel, profile.rules[i]);

          if (item.title && item.target_url && self.itemIsUnique(item, self.items)) {
            self.items.push(item);
          }
        }
      }
      logger.log.info("Parsed: " + channel.url + " items: " + self.items.length + ", time: " + self.timer(start) + "ms");
      callback(self.items);
    }
  }, {ignoreWhitespace: true});
  this.parser = new htmlparser.Parser(this.handler);
  this.parser.parseComplete(html);
}

Parser.timer = function(start) {
  var end = new Date().getTime();
  return Math.floor(end - start);
}

Parser.processItem = function(item_data, channel, rule) {
  var item = {
    title: this.processElement(item_data, rule.title_selector, rule.title_attribute),
    target_url: this.processURL(this.processElement(item_data, rule.target_selector, rule.target_attribute), channel),
    image_url: this.processURL(this.processElement(item_data, rule.image_selector, rule.image_attribute), channel),
    score: this.processScore(this.processElement(item_data, rule.score_selector, rule.score_attribute)),
    score_target_url: this.processURL(this.processElement(item_data, rule.score_target_selector, rule.score_target_attribute), channel)
  }

  // If the target is an image, set it also to image url and we can get an instant preview.
  if (item.target_url && item.target_url.match(/\.(jpg|png|gif)$/gi)) item.image_url = item.target_url;

  // Preview imgur images automatically.
  if (item.target_url) {
    var matches = item.target_url.match(/^http:\/\/imgur\.com\/([\w\d]+)\/?$/);
    if (matches) {
      item.image_url = "http://i.imgur.com/" + matches[1] + ".jpg";
    }
  }

  // Create thumbails for YouTube
  if (item.target_url) {
    var matches = item.target_url.match(/^http:\/\/www.youtube\.com\/watch\?v=([\w\d\-]+)/);
    if (matches) {
      item.image_url = "http://img.youtube.com/vi/" + matches[1] + "/1.jpg";
    }
  }

  // If score target cannot be found, just point it to target.
  if (item.score_target_url == null) item.score_target_url = item.target_url;
  // If score is 0, then remove it alltogether.
  if (item.score == null) item.score_target_url = null;

  return item;
}

Parser.processElement = function(data, selector, attribute) {
  if (typeof(selector) == 'undefined') {
    return null;
  }
  else if (attribute) {
    return this.sanitize(this.findAttribute(select(data, selector), attribute));
  }
  else {
    return this.sanitize(this.findText(select(data, selector)));
  }
}

Parser.findAttribute = function(e, attribute) {
  return (e && e[0] && e[0].attribs) ? e[0].attribs[attribute] : null;
}

Parser.findText = function(e) {
  if (e) {
    for (var i in e) {
      if (e[i].type == "text") {
        return e[i].data;
      }
      else if (e[i].children) {
        return Parser.findText(e[i].children);
      }
      else {
        return null;
      }
    }
  }
  else {
    return null;
  }
}

Parser.findLinks = function() {

}

Parser.processURL = function(url, channel) {
  var normalized_url = URL.resolve(channel.url, url);

  if (url != null && normalized_url) {
    return encodeURI(normalized_url);
  }
  else {
    return null;
  }
}

Parser.processScore = function(string) {
  if (string) {
    string = string.replace(/[^0-9.]/g, '');
    return string == 0 ? null : string;
  }
  else {
    return null;
  }
}

/**
 * Chech that the item's target URL is not present already.
 */
Parser.itemIsUnique = function(item, items) {
  for (var i in items) {
    if (items[i].target_url == item.target_url) {
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

module.exports = Parser;