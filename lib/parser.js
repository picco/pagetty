var
fs         = require("fs");
htmlparser = require("htmlparser"),
logger     = require(__dirname + "/logger.js");
sanitize   = require("validator").sanitize;
select     = require("cheerio-soupselect").select;
$          = require("jquery");

// include URL.js library
eval(fs.readFileSync(__dirname + "/url.js").toString());

Parser = {}

Parser.process = function(html, channel, rules, callback) {
  var self = this;
  var start = new Date().getTime();

  function done(items) {
    logger.log.info("Parsed: " + channel.url + " items: " + items.length + ", time: " + self.timer(start) + "ms");
    callback(items);
  }

  if (channel.type == "html") {
    this.processHTML(html, channel, rules, done);
  }
  else if (channel.type == "rss") {
    this.items = this.processRSS(html, channel, done);
  }
}

Parser.processHTML = function(html, channel, rules, callback) {
  var items = [];

  for (i in rules) {
    var links = $(html).find(rules[i].target.selector).toArray();

    for (j in links) {
      var item = this.processItem(links[j], channel, rules[i]);

      if (item.title && item.target_url && this.itemIsUnique(item, this.items)) {
        items.push(item);
      }
    }
  }

  callback(items);
}

Parser.processRSS = function(html, channel, callback) {
  var FeedParser = require("feedparser"),
      parser     = new FeedParser(),
      items      = [],
      self       = this;

  parser.parseString(html, function(error, meta, articles) {
    if (error) {
      console.error(error);
    }
    else {
      for (var i in articles) {
        items.push({
          created: articles[i].pubdate,
          title: self.sanitize(articles[i].title),
          summary: self.createSummary(articles[i].description),
          target_url: articles[i].link,
          image_url: self.articleImageURL(articles[i]),
          score: null,
          score_target_url: articles[i].comments
        });
      }

      callback(items);
    }
  });
}

Parser.stripTags = function(input, allowed) {
  allowed = (((allowed || "") + "").toLowerCase().match(/<[a-z][a-z0-9]*>/g) || []).join(''); // making sure the allowed arg is a string containing only tags in lowercase (<a><b><c>)
  var tags = /<\/?([a-z][a-z0-9]*)\b[^>]*>/gi,
      commentsAndPhpTags = /<!--[\s\S]*?-->|<\?(?:php)?[\s\S]*?\?>/gi;
  return input.replace(commentsAndPhpTags, '').replace(tags, function ($0, $1) {
    return allowed.indexOf('<' + $1.toLowerCase() + '>') > -1 ? $0 : '';
  });
}

Parser.createSummary = function(text) {
  text = this.stripTags(text).replace(/^\s+|\s+$/g,"");
  var index = text.indexOf(". ");

  if (index > 50 && index < 300) {
    return text.substr(0, index + 1);
  }
  else {
    return text.substr(0, 300) + " &hellip;";
  }
}

Parser.articleImageURL = function(article) {
  var maxWidth = 49; maxIndex = 0;

  if (article.image.url) {
    return article.image.url;
  }
  else {
    var max = 0;
    var images = $(article.description).find("img").toArray();

    for (var i in images) {
      width = parseInt($(images[i]).attr("width"));

      if (width > maxWidth) {
        maxWidth = width;
        maxIndex = i;
      }
    }

    if (maxIndex) {
      return $(images[maxIndex]).attr("src");
    }
    else {
      return null;
    }
  }
}

Parser.timer = function(start) {
  var end = new Date().getTime();
  return Math.floor(end - start);
}

Parser.value = function(data, attribute) {
  return attribute ? $(data).attr(attribute) : $(data).text();
}

Parser.processItem = function(link_data, channel, rule) {
  var item = {
    title: this.sanitize(this.value(link_data, rule.target.title_attribute)),
    target_url: this.processURL(this.value(link_data, rule.target.url_attribute), channel),
    image_url: this.processURL(this.search(link_data, rule.image.selector, rule.image.url_attribute, 3), channel),
    score: this.processScore(this.search(link_data, rule.score.selector, rule.score.value_attribute, 3)),
    score_target_url: this.processURL(this.search(link_data, rule.score.selector, rule.score.url_attribute, 3), channel)
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

Parser.search = function(data, selector, attribute, limit) {
  if (limit == 0) return false;

  var matches = $(data).find(selector).toArray();

  if (matches.length) {
    return this.value($(matches).get(0), attribute);
  }
  else {
    return this.search($(data).parent(), selector, attribute, limit - 1);
  }
}

Parser.processElement = function(data, selector, attribute) {
  if (typeof(selector) == 'undefined') {
    return null;
  }
  else if (attribute) {
    return this.sanitize($(data).find(selector).attr(attribute));
  }
  else {
    return this.sanitize($(data).find(selector).text());
  }
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

process.on("message", function(m) {
  Parser.process(m.html, m.channel, m.rules, function(items) {
    process.send(items);
  });
});