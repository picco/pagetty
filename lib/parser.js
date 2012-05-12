var
fs         = require("fs");
logger     = require(__dirname + "/logger.js");
sanitize   = require("validator").sanitize;
select     = require("cheerio-soupselect").select;
$          = require("jquery");

// include URL.js library
eval(fs.readFileSync(__dirname + "/url.js").toString());

Parser = {}

Parser.process = function(html, channel, rules, callback) {
  var items = [], self = this, start = new Date().getTime();

  for (i in rules) {
    var rawItems = $(html).find(rules[i].item).toArray();

    for (j in rawItems) {
      var item = this.processItem(rawItems[j], channel, rules[i]);

      if (item.title && item.target && this.itemIsUnique(item, this.items)) {
        items.push(item);
      }
    }
  }

  logger.log.info("Parsed: " + channel.url + " items: " + items.length + ", time: " + self.timer(start) + "ms");
  callback(items);
}

Parser.stripTags = function(input, allowed) {
  allowed = (((allowed || "") + "").toLowerCase().match(/<[a-z][a-z0-9]*>/g) || []).join(''); // making sure the allowed arg is a string containing only tags in lowercase (<a><b><c>)
  var tags = /<\/?([a-z][a-z0-9]*)\b[^>]*>/gi,
      commentsAndPhpTags = /<!--[\s\S]*?-->|<\?(?:php)?[\s\S]*?\?>/gi;
  return input.replace(commentsAndPhpTags, '').replace(tags, function ($0, $1) {
    return allowed.indexOf('<' + $1.toLowerCase() + '>') > -1 ? $0 : '';
  });
}

Parser.timer = function(start) {
  var end = new Date().getTime();
  return Math.floor(end - start);
}

Parser.value = function(data, attribute) {
  return attribute ? $(data).attr(attribute) : $(data).text();
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
  if (typeof(selector) == 'undefined') {
    return null;
  }
  else if (attribute) {
    return this.sanitize($(data).find(selector).first().attr(attribute));
  }
  else {
    return this.sanitize($(data).find(selector).first().text());
  }
}

Parser.processURL = function(url, channel) {
  var normalizedUrl = URL.resolve(channel.url, url);

  if (url != null && normalizedUrl) {
    return encodeURI(normalizedUrl);
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
Parser.itemIsUnique = function(item, items) {
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

process.on("message", function(m) {
  Parser.process(m.html, m.channel, m.rules, function(items) {
    process.send(items);
    //process.exit(); // !!! trouble?
  });
});