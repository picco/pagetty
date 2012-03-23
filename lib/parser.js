var
domino     = require("domino"),
fs         = require("fs");
Zepto      = require("zepto-node");

// include URL.js library
eval(fs.readFileSync(__dirname + "/url.js").toString());

Parser = {}

Parser.process = function(html, channel, callback) {
  this.window = domino.createWindow(html);
  this.zepto = Zepto(this.window);
  this.items = [];

  for (i in channel.rules) {
    try {
      var elements = this.zepto(channel.rules[i].item).get();
    }
    catch(err) {
      console.log(err);
    }

    for (j in elements) {
      var item = this.processItem(elements[j], channel, channel.rules[i]);

      if (item.title && item.target_url && this.itemIsUnique(item, this.items)) {
        this.items.push(item);
      }
    }
  }

  callback(this.items);
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
    var matches = item.target_url.match(/^http:\/\/imgur\.com\/([\w\d]+)/);
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
  try {
    if (typeof(selector) == 'undefined') {
      return null;
    }
    else if (attribute) {
      return this.stripTags(this.zepto(data).find(selector).attr(attribute));
    }
    else {
      return this.stripTags(this.zepto(data).find(selector).html());
    }
  }
  catch(err) {
    console.log(err);
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

Parser.stripTags = function(string) {
  if (string) {
    return string.replace(/<\/?(?!\!)[^>]*>/gi, '');
  }
  else {
    return null;
  }
}

process.on('message', function(m) {
  Parser.process(m.html, m.channel, function(items) {
    process.send(items);
    process.exit();
  });
});