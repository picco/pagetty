var _ = require('underscore');
var $ = require('cheerio');
var async = require('async');

var Profiler = module.exports = {};

/**
 * TODO
 */
Profiler.createProfile = function(page, callback) {
  var self = this;
  var segments = {};
  var filteredSegments = []
  var paths = [];

  page.find("a").each(function(index, el) {
    var link = {};

    link.title = $(el).text() || $(el).attr("title") || "";
    link.href = $(el).attr("href") || "";
    link.path = self.getPath($(el));
    link.segmentPath = self.getSegmentPath(link.path);
    link.el = $(el);
    link.selector = self.getSelector(link.path);      
    link.segmentSelector = self.getSelector(link.segmentPath);

    var selector = self.getSelector(link.path);
    var segmentSelector = self.getSelector(link.segmentPath);
 
    if (!segments[segmentSelector]) {
      segments[segmentSelector] = {
        links: [],
        weight: 0
      };
    }

    if (link.title.length && link.href.length) {
      segments[segmentSelector].links.push(link);
    }
  });

  for (var segmentSelector in segments) {
    var segment = segments[segmentSelector];
    var combinedTitleLength = 0;
    var onlyNumbers = 0;

    if (segment.links.length < 2) {
      continue;
    }
  
    for (var i in segment.links) {
      if (segment.links[i].title.match(/^\d+$/)) onlyNumbers++;
      combinedTitleLength += segment.links[i].title.length;
    }

    // Weight calculation

    var averageTitleLength = (combinedTitleLength / segment.links.length);

    if (averageTitleLength > 30) {
      segment.weight += 10;
    }
    else if (averageTitleLength > 20) {
      segment.weight += 5;
    }

    if (segmentSelector.match(/ h1| h2| h3| h4| article/)) segment.weight += 20;
    if (segmentSelector.match(/ h5| h6|\.article|\.title|\.post|\.newsitem/)) segment.weight += 10;
    if (segmentSelector.match(/footer|comment|thumbnail/)) segment.weight -= 5;

    if (_.uniq(_.pluck(segment.links, "title")).length > 1 && onlyNumbers < 3) {
      filteredSegments.push(segments[segmentSelector]);
    }
    
    segment.itemSelector = self.getItemSelector(self.getRootElement(segment));
    segment.url = '/configure/' + self._id + '/?add&itemSelector=' + escape(segment.itemSelector);
  }

  segments = filteredSegments.sort(function(a, b) {
    return parseInt(b.weight) - parseInt(a.weight);
  });
    
  callback(segments);
}

/**
 * TODO: võta esimene, mine tagasi, kuni leiad teise.
 */
Profiler.getRootElement = function(segment) {
  var root = false;
  var a = $(segment.links[0].el);
  var b = $(segment.links[1].el);
  
  while (!root) {
    root = this.findRootMatch(a, a.parent(), b);
    a = a.parent();
  }
      
  return root;
}  

/**
 * TODO
 */
Profiler.findRootMatch = function(ac, a, b) {
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
 * TODO
 */
Profiler.getItemSelector = function(rootElement) {
  return this.getSelector(this.getSegmentPath(this.getPath(rootElement)));
}  


/**
 * TODO
 */
Profiler.getPath = function(el, path) {
  var cur = {name: null, id: null, classes: []};

  // The first time this function is called, path won't be defined.
  if (typeof path == 'undefined') path = [];

  // There's no parents anymore.
  if (!el || !el.length || el.get(0).type == 'root') return path;

  cur.name = el.get(0).name.toLowerCase();
  cur.id = el.attr("id") || null;

  var classes = new String(el.attr("class")).split(/[\s\n]+/);

  for (var i in classes) {
    if (classes[i]) cur.classes.push(classes[i]);
  }

  if (cur.name == "html") return path;

  path.unshift(cur);

  return this.getPath(el.parent(), path);
}  

/**
 * Build a unique CSS selector for a jQuery element.
 * Based on getPath plugin: http://davecardwell.co.uk/javascript/jquery/plugins/jquery-getpath/
 */
Profiler.getSegmentPath = function(path) {
  var segmentPath = [];

  for (var i in path) {
    var p = {name: null, id: null, classes: []};

    // Take TagName as-is.
    p.name = path[i].name;

    // Filter out classes with numeric names.
    if (path[i].id && !path[i].id.match(/\d/)) p.id = path[i].id;

    // Filter out classes with numeric names.

    var filteredClasses = [];

    for (var j in path[i].classes) {
      if (!path[i].classes[j].match(/\d|clear|odd|even|tag|category|status/)) {
        filteredClasses.push(path[i].classes[j]);
      }
    }

    p.classes = filteredClasses;
    p.classes = [];
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
      cur += '#' + path[i].id;
    }

    if (path[i].classes.length) {
      cur += ("." + path[i].classes.join("."));
    }

    selector.push(cur);
  }

  return selector.join(" > ");
}
