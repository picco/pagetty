var _ = require('underscore');
var $ = require('cheerio');
var async = require('async');

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
    var links = page.find(linkSegments[i]).toArray();
    
    if (links.length >= 2) {
      var root = this.findRootElement(links);
      
      if (root) {
        itemSegments.push(this.getSelector(this.getSegmentPath(this.getPath(root))));
        //itemSegments.push(this.getSelector(this.getSegmentPath(this.getPath(root), true)));
      }
    }
  }
  
  itemSegments = _.uniq(itemSegments);
  
  // Build the segments object.
  
  for (var i in itemSegments) {
    segments.push({
      itemSelector: itemSegments[i],
      target: this.findTarget(page, itemSegments[i]),
      image: this.findImage(page, itemSegments[i]),
      links: [],
      weight: 0,
    });
  }

  //console.dir(segments);
  
  // Calculate segment weights.
  
  var filteredSegments = [];
  
  for (var i in segments) {
    var segment = segments[i];    
    segment.combinedSelector = segment.itemSelector + ' ' + segment.target.selector;
        
    var els = page.find(segment.combinedSelector).toArray();
    
    for (var j in els) {
      var title = segment.target.title_attribite ? $(els[j]).attr(segment.target.title_attribite) : $(els[j]).text();
      var href = $(els[j]).attr(segment.target.url_attribute) || null;
      //console.dir($(els[j]));
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

    //console.dir(segment);
    
    if (segment.uniqTitles > 1 && segment.onlyNumbers < 3) {
      filteredSegments.push(segment);
    }
    else {
      console.log('Excluding!');
    }
  }
   
  segments = filteredSegments.sort(function(a, b) {
    return parseInt(b.weight) - parseInt(a.weight);
  });  
  
  //console.dir(segments);
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
  if (root.get(0).name == 'a') return false;

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
 * TODO
 */
Profiler.findTarget = function(page, itemSelector) {
  var target = {selector: null, url_attribute: 'href', title_attribute: ''};
  var candidates = [];
  var sampleIndex = 0;
  var samples = $(itemSelector, page);
  var sampleFound = false;
  
  while (!sampleFound) {
    var sample = $(samples.get(sampleIndex)).html();
    var links = $('a', sample).toArray();
    sampleFound = links.length;
    sampleIndex++;
  }

  //console.dir('Item selector: ' + itemSelector);
  //console.dir('Links count: ' + links.length);

  for (var i in links) {
    var p = this.getPath($(links[i]));
    var s = this.getSelector(p);
    var w = 0;

    if (s.match(/h1|h2|h3|h4|article/)) w += 20;
    if (s.match(/h5|h6|title|post|newsitem/)) w += 10;
    if (s.match(/p /)) w -= 10; // links in article content.
    if (s.match(/comment/)) w -= 30; // links for comments.

    candidates.push({p: p, s: s, w: w});
  }

  //console.dir(candidates);  
  
  target.selector = this.getSelector(this.getSegmentPath(this.findBestMatch(candidates)));
  return target;
}

Profiler.findImage = function(page, itemSelector) {
  return {selector: 'img', attribute: 'src'};
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
  if (!el || !el.length || el.get(0).type == 'root') return path;

  cur.name = el.get(0).name.toLowerCase();
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
