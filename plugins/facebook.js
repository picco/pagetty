exports.attach = function (options) {
  var app = this;
  var _ = require('underscore');
  var request = require('request');

  this.facebook = {};

  /**
   * Returns the number of likes for the given URL.
   */
  this.facebook.likes = function(url, callback) {
    var query_url = 'https://api.facebook.com/method/fql.query?query=select%20%20like_count%20from%20link_stat%20where%20url=%22' + url + '%22&format=json';

    request.get({url: query_url, json: true}, function(err, response, body) {
      callback((body[0] && body[0].like_count) ? body[0].like_count : null);
    });
  }
}