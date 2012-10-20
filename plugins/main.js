exports.attach = function (options) {
  var app = this;
  var async = require('async');
  var exec = require('child_process').exec;
  var fs = require('fs');
  var hogan = require('hogan.js');
  var mongoose = require('mongoose');
  var nodemailer = require('nodemailer');
  var request = require('request');
  var spawn = require('child_process').spawn;
  var zlib = require('zlib');

  this.conf = require('config').server;
  this.db = mongoose.createConnection(app.conf.db_host, app.conf.db_name);

  this.use(require('./notify.js'));
  this.use(require('./models/state.js'));
  this.use(require('./models/channel.js'));
  this.use(require('./models/cache.js'));
  this.use(require('./models/history.js'));
  this.use(require('./models/rule.js'));
  this.use(require('./models/user.js'));

  /**
   * Downloads the data from a given URL in real-time.
   */
  this.fetch = function(options, callback) {
    // Retrieve item from cache if available.
    if (options.url == null || !options.url.match(/^(http|https):\/\//)) {
      callback("Invalid URL: " + options.url);
      return;
    }
    else if (options.useCache) {
      var now = new Date().getTime();
      var maxAge = new Date(now - (60 * 60 * 1000)); // 60 minutes.

      app.cache.findOne({url: options.url, created: {$gt: maxAge}}, function(err, cache) {
        if (err) {
          callback(err);
        }
        else if (cache) {
          console.log('Fetched from cache: ' + options.url);
          callback(null, cache.content);
        }
        else {
          app.fetchWithoutCache(options, function(err, buffer) {
            if (buffer.toString().length) app.cache.update({url: options.url}, {$set: {content: buffer, created: new Date()}}, {upsert: true});
            console.log('Fetched fresh content (cache updated): ' + options.url);
            callback(err, buffer);
          });
        }
      });
    }
    else {
      app.fetchWithoutCache(options, function(err, buffer) {
        if (buffer.toString().length) app.cache.update({url: options.url}, {$set: {content: buffer, created: new Date()}}, {upsert: true});
        console.log('Fetched fresh content (cache updated): ' + options.url);
        callback(err, buffer);
      });
    }
  }

  /**
   * TODO
   */
  this.fetchWithoutCache = function(options, callback) {
    async.waterfall([
      // Download content.
      function(next) {
        if (options.evaluateScripts) {
          exec('phantomjs --load-images=no ./lib/phantom.js ' + options.url, {maxBuffer: 2000*1024}, function (error, stdout, stderr) {
            next(error, new Buffer(stdout));
          });
        }
        else {
          // When encoding is null the content is returned as a Buffer.
          var r = request.defaults({timeout: 10000, encoding: null});

          r.get(options, function(err, response, buffer) {
            if (err) {
              next(err);
            }
            else if (response.statusCode == 403) {
              next("HTTP 403: Access denied");
            }
            else if (response.statusCode == 404) {
              next("HTTP 404: Not found");
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
      }
    ], function(err, buffer) {
      callback(err, buffer);
    });
  }

  /**
   * Build a custom validator that does not throw exceptions.
   */
  this.getValidator = function() {
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
   * TODO
   */
  this.timer = function(start) {
    var end = new Date().getTime();
    return Math.floor(end - start);
  }

  /**
   * TODO
   */
  this.objectId = function(id) {
    return (typeof id == "object") ? id : new mongoose.Types.ObjectId(id);
  }

  /**
   * Create an unique ObjectID from current timestamp.
   */
  this.createObjectID = function() {
    return new mongoose.Types.ObjectId(new Date().getTime() / 1000);
  }

  /**
   * Send an email using a template.
   */
  this.mail = function(mail, template, templateData) {
    mail.transport = nodemailer.createTransport("SMTP");
    mail.from = app.conf.mail.from;

    async.waterfall([
      function(next) {
        if (template) {
          fs.readFile('./mail/' + template + '.hulk', function (err, data) {
            if (err) {
              next(err);
            }
            else {
              templateData.conf = app.conf;
              mail.text = hogan.compile(data.toString()).render(templateData);
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
    ], function() {
      mail.transport.close();
    });
  }

  /**
   * TODO
   */
  this.tidy = function(html, callback) {
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
}
