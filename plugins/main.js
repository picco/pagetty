exports.attach = function (options) {
  var app = this;
  var async = require('async');
  var fs = require('fs');
  var hogan = require('hogan.js');
  var mongoose = require('mongoose');
  var nodemailer = require('nodemailer');
  var request = require('request');
  var spawn = require('child_process').spawn;
  var zlib = require('zlib');

  this.conf = require('config').server;
  this.db = mongoose.createConnection(app.conf.db_host, app.conf.db_name);

  this.use(require('./models/channel.js'));
  this.use(require('./models/cache.js'));
  this.use(require('./models/history.js'));
  this.use(require('./models/rule.js'));
  this.use(require('./models/user.js'));
  this.use(require('./models/state.js'));

  this.mailTransport = nodemailer.createTransport("SMTP");

  /**
   * Gets the data for a given URL from cache or
   * downloads it realtime if cached copy is unavailable.
   */
  this.fetch = function(options, callback) {
    app.cache.findOne({url: options.url}, function(err, cache) {
      if (err) {
        callback(err);
      }
      else if (cache) {
        callback(null, cache.content);
      }
      else {
        app.download(options, function(err, buffer) {
          callback(err, buffer);
        });
      }
    });
  }

  /**
   * Downloads the data from a given URL in real-time.
   */
  this.download = function(options, callback) {
    // When encoding is null the content is returned as a Buffer.
    var r = request.defaults({timeout: 10000, encoding: null});

    if (options.url == null || !options.url.match(/^(http|https):\/\//)) {
      callback("Invalid URL: " + options.url);
      return;
    }

    async.waterfall([
      // Download content.
      function(next) {
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
      },
      // Update cache.
      function(buffer, next) {
        if (buffer.toString().length) {
          app.cache.update({url: options.url}, {$set: {content: buffer, created: new Date()}}, {upsert: true}, function(err) {
            next(err, buffer);
          });
        }
      },
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
      return this._errors.length;
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

  this.mail = function(mail, template) {
    var self = this, body = mail.body;

    sequence.then(function(next) {
      if (template) {
        self.loadTemplate('mail/' + template + '.hulk', function(data) {
          var compiled_template = hogan.compile(data.toString());
          body = compiled_template.render(mail);
          next();
        })
      }
      else {
        next();
      }
    })
    .then(function(next, data) {
      nodemailer.sendMail({
        transport: self.mailTransport,
        from : config.mail.from,
        to : mail.to,
        subject : mail.subject,
        text: body
      },
      function(err) {
        if (err) throw err;
        self.mailTransport.close();
      });
    })
  }

  this.loadTemplate = function(file, callback) {
    fs.readFile('./templates/' + file, function (err, data) {
      if (err) throw err;
      callback(data);
    });
  }

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
      callback(buffer);
    });

    tidy.stdin.write(html);
    tidy.stdin.end();
  }
}