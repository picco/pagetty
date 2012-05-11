var _ = require("underscore");
var $ = require("jquery");
var request = require("request");
var async = require("async");
/*
var url = "http://smashingmagazine.com";
var testX = "Designing With Audio: What Is Sound Good For?";
var testY = "Beercamp: An Experiment With CSS 3D";
*/
var url = "http://dailyjs.com/";
var testX = "Colonne, n8iv, Three Bad Parts";
var testY = "Unix and Node: Syslog";

var url = "http://500px.com/popular";
var testX = "breath";
var testY = "Fog";

var url = "http://www.anandtech.com/";
var testX = "HP Folio 13 Review: Deviating From the Norm";
var testY = "Intel SSD 330 Officially Announced: Affordable SandForce";

var url = "http://www.delfi.ee/";
var testX = "USAs järjekordne missiooniskandaal - sõdurid poseerisid mässuliste kehaosadega";
var testY = "FOTOD: Tallinna vanalinna ja mere vahel asuv lõbustuspark lummab pimedas värvidemänguga";

var url = "https://github.com/blog";
var testX = "An easier way to create repositories";
var testY = "Credential Caching for Wrist-Friendly Git Usage";

var document = false;
var itemX = false;
var itemY = false;
var commonRootItem = false;
var contentItem = false;
var limiterSelectorComponents = [];
var itemSelectorComponents = [];
var itemSelector;

request(url, function(err, response, body) {
  document = $(body);
  var links = document.find("a");
  console.log("Links found in document: " + links.length);

  async.series([

    // Find the test links from the document.
    function(callback) {
      links.each(function(index, value) {
        var e = $(value);

        if (e.text() == testX) {
          itemX = e;
          console.log("Found match for itemX: " + itemX.html());
        }

        if (e.text() == testY) {
          itemY = e;
          console.log("Found match for itemY: " + itemY.html());
        }

        if ((itemX && itemY)) {
          callback(null);
          return false;
        }

        if (index == (links.length - 1)) {
          throw "itemX and/or itemY not found :(";
        }
      });
    },

    // Find commonRootItem.
    function(callback) {
      findCommonRoot(itemX, itemY, function(found) {
        if (found) {
          console.log("Found commonRootItem");
          //console.dir(commonRootItem);
          callback(null);
        }
        else {
          throw "commonRootItem not found";
        }
      });
    },

    // Find limiterItem.
    function(callback) {
      findLimiterSelector(commonRootItem, function() {
        itemSelector = serializeSelector(limiterSelectorComponents) + " " + contentItem.get(0).tagName;
        console.log("Itemselector: " + itemSelector);
        callback(null);
      });
    },

  ]);
});

function findCommonRoot(itemX, itemY, callback) {
  var parentX = itemX.parent();
  var links = parentX.find("a");

  contentItem = itemX;

  console.log("Starting findCommonRoot loop: " + parentX.get(0).tagName);

  // Find all itemX child links from document.
  // If we find itemY from the result set then we have found the common root element.

  if (links.length) {
    links.each(function(index, value) {
      var e = $(value);

      if (e.html() == itemY.html()) {
        commonRootItem = parentX;
        callback(true);
        return;
      }
      if (commonRootItem == false && index == (links.length - 1)) {
        findCommonRoot(parentX, itemY, callback);
      }
    });
  }
  else {
    callback(false);
  }
}

function findLimiterSelector(element, callback) {
  var selector = false;
  var selectorData = getSelectorData(element);

  // Create all possible selectors in the form: #ID and TAG.SINGLE_CLASS
  // If such selector matches only one element in the DOM we have found the limiter.

  if (selectorData.id) {
    selector = "#" + selectorData.id;
    completeSelector = serializeSelector(limiterSelectorComponents, selector);

    console.log("Searching for limiter: " + completeSelector);

    if (selectorIsUnique(completeSelector)) {
      limiterSelectorComponents.push(selector);
      callback(true);
      return;
    }
  }
  else if (selectorData.classes.length) {
    for (name in selectorData.classes) {
      selector = selectorData.tagName + "." + selectorData.classes[name];
      completeSelector = serializeSelector(limiterSelectorComponents, selector);

      console.log("Searching for limiter: " + completeSelector);

      if (selectorIsUnique(completeSelector)) {
        limiterSelectorComponents.push(selector);
        callback(true);
        return;
      }
    }
  }

  selector = selectorData.tagName;
  completeSelector = serializeSelector(limiterSelectorComponents, selector);
  console.log("Searching for limiter: " + completeSelector);

  if (selectorIsUnique(completeSelector)) {
    limiterSelectorComponents.push(selector);
    callback(true);
    return;
  }
  else {
    limiterSelectorComponents.push(selector);
    findLimiterSelector(element.parent());
  }
}

function serializeSelector(selectorComponents, additionalElement) {
  var components = _.clone(selectorComponents);

  if (additionalElement) components.push(additionalElement);
  return components.reverse().join(" > ");
}

/**
 * Extrat the selector data from SoupSelect DOM node for easier processing.
 */
function getSelectorData(e) {
  var id = e.attr("id");
  var classes = e.attr("class");

  return {
    id: id || false,
    tagName: e.get(0).tagName,
    classes: (classes.length ? classes.split(/\s+/) : [])
  };
}

/**
 * Test if the selector matches only a single result.
 */
function selectorIsUnique(selector) {
  var length = document.find(selector).length;
  console.log("Matches: " + length);
  return length == 1;
}
