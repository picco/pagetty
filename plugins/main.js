exports.attach = function (options) {
  var app = this;
  var _ = require("underscore");
  var $ = require("cheerio");
  var async = require('async');
  var feedparser = require("feedparser");
  var fs = require('fs');
  var hash = require("mhash").hash;
  var hbs = require("hbs");
  var mongoose = require('mongoose');
  var nodemailer = require('nodemailer');
  var request = require("request");
  var spawn = require('child_process').spawn;
  var uri = require("url");
  var winston = require("winston");
  var zlib = require("zlib");

  app.build = new Date().getTime();
  app.dir = fs.realpathSync(__dirname + '/..');

  app.conf = require("config").server;
  app.db = mongoose.createConnection(app.conf.db_host, app.conf.db_name);

  this.use(require('./notify.js'));
  this.use(require('./parser.js'));
  this.use(require('../models/channel.js'));
  this.use(require('../models/item.js'));
  this.use(require('../models/list.js'));
  this.use(require('../models/rule.js'));
  this.use(require('../models/user.js'));

  /**
   * Downloads the data from a given URL in real-time.
   */
  app.fetch = function(options, callback) {
    var status = null;

    if (options.url == null || !options.url.match(/^(http|https):\/\//)) {
      app.err("fetch", "Invalid URL", options.url);
      callback("Invalid URL: " + options.url);
      return;
    }
    else {
      async.waterfall([
        // Download content.
        function(next) {
          // When encoding is null the content is returned as a Buffer.
          var r = request.defaults({timeout: 30000, encoding: null});

          r.get(options, function(err, response, buffer) {
            if (response) status = response.statusCode;

            if (err) {
              next(err);
            }
            else if (response.statusCode == 403 || response.statusCode == 401) {
              next("Access denied");
            }
            else if (response.statusCode == 404) {
              next("Not found");
            }
            else {
              if (response.headers["content-encoding"] == "gzip") {
                zlib.gunzip(buffer, function(err, uncompressed) {
                  if (err) {
                    callback("Unable to parse gzipped content.");
                    return;
                  }
                  else {
                    next(null, uncompressed);
                  }
                });
              }
              else {
                next(null, buffer);
              }
            }
          });
        }
      ], function(err, buffer) {
        if (err) {
          app.err("fetch", err.toString(), status, options.url);
          callback(err.toString());
        }
        else if (buffer && buffer.length) {
          app.log("fetch", status, parseInt(buffer.length / 1024) + "kB", options.url);
          callback(err, buffer);
        }
        else {
          app.err("fetch", "no content", status, options.url);
          callback("No content.");
        }
      });
    }
  }

  /**
   * Convert buffer to string with encoding autodetection.
   */
  app.bufferToString = function(buffer) {
    var charsetDetector = require("node-icu-charset-detector");
    var charset = charsetDetector.detectCharset(buffer).toString();

    try {
      return buffer.toString(charset);
    } catch (x) {
      var Iconv = require("iconv").Iconv;
      var charsetConverter = new Iconv(charset, "utf8");
      return charsetConverter.convert(buffer).toString();
    }
  }

  /**
   * Build a custom validator that does not throw exceptions.
   */
  app.getValidator = function() {
    var validator = require('validator').Validator;
    var v = new validator();

    v.error = function (msg) {
      this._errors.push(msg);
    }

    v.hasErrors = function () {
      return this._errors ? this._errors.length : false;
    }

    v.getErrors = function () {
      return this._errors;
    }

    return v;
  }

  /**
   * Detect if content is an RSS feed or an HTML page.
   */
  app.detectFeedType = function(content) {
    var xml_tag_pos = content.indexOf("<?xml");
    if (xml_tag_pos >= 0 && xml_tag_pos < 10) return "rss";

    var rss_tag_pos = content.indexOf("<rss");
    if (rss_tag_pos >= 0 && rss_tag_pos < 10) return "rss";

    return "html";
  }

  /**
   * Extract the linked RSS feeds from HTML.
   */
  app.discoverFeeds = function(feed, callback) {
    var feeds = {};
    var items = $(feed.content).find("link[type*=rss], link[type*=atom]").toArray();

    for (var i in items) {
      var url = $(items[i]).attr("href");

      if (url.indexOf('http') !== 0) url = uri.resolve(feed.url, url);
      feeds[url] = {url: url, title: $(items[i]).attr("title") || url};
    }

    callback(_.toArray(feeds));
  }

  /**
   * Initialize Winston logger.
   */
  app.logger = new (winston.Logger)({
    transports: [
      new (winston.transports.Console)({colorize: true}),
    ],
    levels: {info: 0, error: 1, access: 2},
    colors: {info: "green", error: "red", access: "grey"},
  });

  /**
   * Send an email using a template.
   */
  app.mail = function(mail, template, templateData) {
    mail.transport = nodemailer.createTransport("SMTP");
    mail.from = app.conf.mail.from;

    async.waterfall([
      function(next) {
        if (template) {
          fs.readFile('./templates/mail/' + template + '.hbs', function (err, data) {
            if (err) {
              next(err);
            }
            else {
              templateData.conf = app.conf;
              mail.text = hbs.compile(data.toString())(templateData);
              next(null);
            }
          });
        }
        else {
          next(null);
        }
      },
      function(next) {
        nodemailer.sendMail(mail, function(err) {
          next(err);
        });
      }
    ], function(err) {
      if (err) app.err(err.toString());
      mail.transport.close();
    });
  }

  /**
   * Check the type and health of the feed and gather some metadata.
   */
  app.parseFeed = function(url, callback) {
    var feed = {url: url};

    // Add http:// to the URL automatically if missing.
    if (feed.url.indexOf('http') !== 0) feed.url = 'http://' + feed.url;

    async.series([
      // Check that the URL actually returns some data.
      // Detect if HTML or RSS feed.
      function(next) {
        app.fetch({url: feed.url}, function(err, buffer) {
          if (err) {
            next(err);
          }
          else if (buffer) {
            feed.content = app.bufferToString(buffer);
            feed.type = app.detectFeedType(feed.content);
            next();
          }
          else {
            next("Could not fetch content.");
          }
        });
      },
      // Detect the domain and title attributes.
      function(next) {
        var link = null;

        if (feed.type == "rss") {
          feedparser.parseString(feed.content, function(err, meta, articles) {
            if (meta.link) {
              link = meta.link;
            }
            else if (articles[0] && articles[0].origlink) {
              // Meta link may be missing, try to detect the domain from an article.
              var article_link = uri.parse(articles[0].origlink);
              link = article_link.protocol + "//" + article_link.hostname;
            }
            else {
              next("Unable detect domain.");
              return;
            }

            feed.domain = uri.parse(link).hostname;
            feed.link = link;
            feed.title = meta.title || link;
            next();
          });
        }
        else {
          feed.domain = uri.parse(feed.url).hostname;
          feed.link = feed.url;
          feed.title = $(feed.content).find("title").text() || feed.url;
          next();
        }
      },
      // Search for available RSS feeds in HTML feeds.
      function(next) {
        if (feed.type == "html") {
          app.discoverFeeds(feed, function(feeds) {
            feed.feeds = feeds;
            next();
          });
        }
        else {
          next();
        }
      },
    ], function(err) {
      callback(err, feed);
    });
  }

  /**
   * Return tidy html.
   */
  app.tidy = function(html, callback) {
    var buffer = '', err = '';

    var tidy = spawn('tidy',
      [
          '-indent',
          '--quiet', 'y',
          '--markup', 'y',
          '--output-xml', 'y',
          '--input-xml', 'y',
          '--show-warnings', 'n',
          '--quote-nbsp', 'y',
          '--preserve-entities', 'y',
          '--wrap', '0'
      ]);

    tidy.stdout.on('data', function (data) {
      buffer += data;
    });

    tidy.stderr.on('data', function (data) {
      err += data;
    });

    tidy.on('exit', function (code) {
      callback(err, buffer);
    });

    tidy.stdin.write(html);
    tidy.stdin.end();
  }

  /**
   * Return time past since start.
   */
  app.timer = function(start) {
    var end = new Date().getTime();
    return Math.floor(end - start);
  }
}

exports.init = function(callback) {
  var app = this;

  /**
   * Wrapper for winston.log().
   */
  app.log = function() {
    app.logger.info(Array.prototype.slice.call(arguments).join(" "));
  }

  /**
   * Wrapper for custom log level.
   */
  app.logAccess = function() {
    app.logger.log("access", Array.prototype.slice.call(arguments).join(" "));
  }

  /**
   * Wrapper for winston.error().
   */
  app.err = function() {
    app.logger.error(Array.prototype.slice.call(arguments).join(" "));
  }

  callback();
}