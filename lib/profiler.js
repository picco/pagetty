var _ = require('underscore');
var $ = require('cheerio');
var http = require('http');

var Profiler = module.exports = {};

/**
 * TODO
 */
Profiler.createSegments = function(page, callback) {
  var self = this;
  var segments = [];
  var linkSegments = [];
  var itemSegments = [];

  // Build the linkSegments object.

  var q = page.find("a").toArray();

  for (var i in q) {
    linkSegments.push(self.getSelector(self.getSegmentPath(self.getPath($(q[i])))));
  }

  linkSegments = _.uniq(linkSegments);

 // Build the itemSegments object.

  for (var i in linkSegments) {
    var results = page.find(linkSegments[i]);

    if (results.length) {
      var links = results.toArray();

      if (links.length >= 2) {
        var root = this.findRootElement(links);

        if (root) {
          itemSegments.push(this.getSelector(this.getSegmentPath(this.getPath(root))));
        }
      }
    }
  }

  itemSegments = _.uniq(itemSegments);

  // Build the segments object.

  for (var i in itemSegments) {
    var segment = {itemSelector: itemSegments[i], links: [], weight: 0};
    this.findTarget(segment, page, itemSegments[i]);
    this.findImage(segment, page, itemSegments[i]);
    this.findCommentsScore(segment, page, itemSegments[i]);
    segments.push(segment);
  }

  // Calculate segment weights.

  var filteredSegments = [];

  for (var i in segments) {
    var segment = segments[i];
    segment.combinedSelector = segment.itemSelector + ' ' + segment.target.selector;

    var els = page.find(segment.combinedSelector).toArray();

    for (var j in els) {
      var title = segment.target.title_attribute ? $(els[j]).attr(segment.target.title_attribute) : $(els[j]).text();
      var href = $(els[j]).attr(segment.target.url_attribute) || null;
      if (title && href) segment.links.push({title: title, href: href});
    }

    segment.onlyNumbers = 0;
    segment.linksCount = segment.links.length;
    segment.uniqTitles = _.uniq(_.pluck(segment.links, "title")).length;
    segment.averageTitleLength = (segment.combinedTitleLength / segment.linksCount);

    for (var i in segment.links) {
      if (segment.links[i].title.match(/^\d+$/)) segment.onlyNumbers++;
      segment.combinedTitleLength += segment.links[i].title.length;
    }

    if (segment.averageTitleLength > 30) {
      segment.weight += 10;
    }
    else if (segment.averageTitleLength > 20) {
      segment.weight += 5;
    }

    if (segment.combinedSelector.match(/h1|h2|h3|h4|article/)) segment.weight += 20;
    if (segment.combinedSelector.match(/h5|h6|title|post|newsitem/)) segment.weight += 10;
    if (segment.combinedSelector.match(/footer|comment|thumbnail/)) segment.weight -= 5;

    if (segment.uniqTitles > 1 && segment.onlyNumbers < 3) {
      filteredSegments.push(segment);
    }
  }

  segments = filteredSegments.sort(function(a, b) {
    return parseInt(b.weight) - parseInt(a.weight);
  });

  callback(segments);
}

/**
 * TODO: võta esimene, mine tagasi, kuni leiad teise.
 */
Profiler.findRootElement = function(links) {
  var root = false;
  var a = $(links[0]);
  var b = $(links[1]);

  while (!root) {
    root = this.checkMatch(a, a.parent(), b);
    a = a.parent();
  }

  // If there is no wrapper container for the links, then the segment cannot be used.
  if (root[0].name == 'a') return false;

  return root;
}

/**
 * TODO
 */
Profiler.checkMatch = function(ac, a, b) {
  var text = b.text();
  var href = b.attr('href');
  var search = a.find("a").toArray();

  for (var i in search) {
    if ($(search[i]).text() == text && $(search[i]).attr('href') == href) {
      return ac;
    }
  }

  return false;
}

/**
 * Find the target link inside the item.
 */
Profiler.findTarget = function(segment, page, itemSelector) {
  var candidates = [];
  var sampleIndex = 0;
  var samples = $(itemSelector, page);
  var sampleFound = false;

  segment.target = {selector: '', url_attribute: 'href', title_attribute: ''};

  while (!sampleFound) {
    var sample = $(samples[sampleIndex]).html();
    var links = $('a', sample).toArray();
    sampleFound = links.length;
    sampleIndex++;
  }

  for (var i in links) {
    var p = this.getPath($(links[i]));
    var s = this.getSelector(p);
    var w = 0;

    if (s.match(/h1|h2|h3|h4|h5|h6/)) w += 20;
    if (s.match(/article|title|post|newsitem/)) w += 10;
    if (s.match(/p /)) w -= 10; // links in article content.
    if (s.match(/comment|readmore/)) w -= 30; // related links.

    candidates.push({p: p, s: s, w: w});
  }

  segment.target.selector = this.getSelector(this.getSegmentPath(this.findBestMatch(candidates)));

  // In some cases, the target element does not have any text content (contains image), try to use the title attribute then.

  var link = $(segment.target.selector, sample)[0];

  if (!$(link).text() && $(link).attr('title')) {
    segment.target.title_attribute = 'title';
  }
}

Profiler.findImage = function(segment, page, itemSelector) {
  var samples = $(itemSelector, page).toArray();
  var jpgImage = null;

  segment.image = {selector: 'img[src*=jpg], img[src*=jpeg]', attribute: 'src'};

  for (var i in samples) {
    var sample = $(samples[i]).html();
    var images = $('img', sample).toArray();

    for (var j in images) {
      var src = $(images[j]).attr('src') || '';

      if (src.match(/\.(jpg|jpeg)$/)) {
        if (!jpgImage) jpgImage = images[j];
      }

      if ($(images[j]).attr('data-src')) {
        segment.image.selector = this.getSelector(this.getSegmentPath(this.getPath($(images[j]))));
        segment.image.attribute = 'data-src';
        return;
      }
      else if ($(images[j]).attr('data-original')) {
        segment.image.selector = this.getSelector(this.getSegmentPath(this.getPath($(images[j]))));
        segment.image.attribute = 'data-original';
        return;
      }
      else if ($(images[j]).attr('data-img')) {
        segment.image.selector = this.getSelector(this.getSegmentPath(this.getPath($(images[j]))));
        segment.image.attribute = 'data-img';
        return;
      }
    }
  }
}

/**
 * Find the comments and score selectors.
 */
Profiler.findCommentsScore = function(segment, page, itemSelector) {
  var samples = $(itemSelector, page).toArray();

  segment.comments = {selector: '', attribute: 'href'};
  segment.score = {selector: '', attribute: ''};

  breakpoint:

  for (var i in samples) {
    var sample = $(samples[i]).html();
    var links = $('a', sample).toArray();

    for (var j in links) {
      var title = $(links[j]).text();
      var href = $(links[j]).attr('href');
      var classNames = $(links[j]).attr('class');
      var regex = /comment/i;

      if ((title + href + classNames).match(regex)) {
        var selector = this.getSelector(this.getSegmentPath(this.getPath($(links[j]))));

        if (selector.match(regex) || href.match(/#comments/)) {
          segment.comments.selector = segment.score.selector = selector;
          break breakpoint;
        }
      }
    }
  }

  // If the identified selector matches more than one item, try alternative combnations.

  if (segment.comments.selector && $(segment.comments.selector, sample).length > 1) {
    var selector = segment.comments.selector + '[href*="comment"]';

    if ($(selector, sample).length == 1) {
      segment.comments.selector = segment.score.selector = selector;
    }
  }
}

/**
 * TODO
 */
Profiler.findBestMatch = function(candidates) {
  candidates = candidates.sort(function(a, b) {
    return parseInt(b.w) - parseInt(a.w);
  });

  return candidates.shift().p;
}

/**
 * TODO
 */
Profiler.getPath = function(el, path) {

  var cur = {name: null, id: null, classes: []};

  // The first time this function is called, path won't be defined.
  if (typeof path == 'undefined') path = [];

  // There's no parents anymore.
  if (!(el[0] && el[0].type == 'tag')) return path;

  cur.name = el[0].name.toLowerCase();
  cur.id = el.attr("id") || null;

  var classes = new String(el.attr("class")).split(/[\s\n]+/);

  if (classes != 'undefined') {
    for (var i in classes) {
      if (classes[i]) cur.classes.push(classes[i]);
    }
  }

  if (cur.name == "html") return path;

  path.unshift(cur);

  return this.getPath(el.parent(), path);
}

/**
 * Build a unique CSS selector for a jQuery element.
 * Based on getPath plugin: http://davecardwell.co.uk/javascript/jquery/plugins/jquery-getpath/
 */
Profiler.getSegmentPath = function(path, loose) {
  var segmentPath = [];

  for (var i in path) {
    var p = {name: null, id: null, classes: []};

    // Take TagName as-is.
    p.name = path[i].name;

    // Filter out classes with numeric id's.
    if (path[i].id && !path[i].id.match(/\d/)) p.id = path[i].id;

    // If ID is used, loose the preceding parts to make it cleaner.
    if (p.id) segmentPath = [];

    // Filter out classes with numeric names.

    if (loose != true) {
      var filteredClasses = [];

      for (var j in path[i].classes) {
        if (!path[i].classes[j].match(/\d|clear|odd|even|tag|category|status|first|last|hide|show|float/)) {
          filteredClasses.push(path[i].classes[j]);
          // allow only one class in segments.
          break;
        }
      }

      p.classes = filteredClasses;
    }

    segmentPath.push(p);
  }

  return segmentPath;
}

/**
 * Convert a path object to a CSS selector.
 */
Profiler.getSelector = function(path) {
  var selector = [];

  for (var i in path) {
    cur = path[i].name;

    if (path[i].id) {
      cur = '#' + path[i].id;
    }

    if (path[i].classes.length) {
      cur += ("." + path[i].classes.join("."));
    }

    selector.push(cur);
  }

  return selector.join(" > ");
}
