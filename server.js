const
  user_id = 'b8ac4a414a81f75ff0e2452cac001538';

var
  _ = require('underscore'),
  config = require('config').server,
  express = require('express'),
  hulk = require('hulk-hogan'),
  hogan = require('hogan.js'),
  futures = require('futures'),
  mongoose = require('mongoose'),
  mustache = require('mustache'),
  Pagetty = require('./Pagetty.js'),
  Schema = mongoose.Schema,
  ObjectId = Schema.ObjectId,
  user = false,
  channels = [];

app = express.createServer();
app.set('view engine', 'hulk');
app.set('views', __dirname + '/views');
app.use(express.static(__dirname + '/public'));
app.use(express.bodyParser());
app.use(express.cookieParser());
app.use(express.session({secret: "nõude"}));
app.use(express.errorHandler({dumpExceptions: true, showStack: true}));
app.register('.hulk', hulk);
app.dynamicHelpers({
  messages: require('express-messages')
});

/**
 * Render frontpage.
 */
app.get('/', function(req, res) {
  res.render('index');
});

/**
 * Render the main application.
 */
app.get('/app', function(req, res) {
  var sequence = futures.sequence(), err, user, channels;

  sequence
    .then(function(next, err) {
      Pagetty.loadUser(user_id, function(u) {
        user = u;
        next();
      });
    })
    .then(function(next, err) {
      Pagetty.loadUserChannels(user, function(c) {
        channels = c;
        next();
      });
    })
    .then(function(next, err) {
      res.render('app', {title: 'Pagetty', channels: _.toArray(channels), channels_json: JSON.stringify(channels)});
    });
});

/**
 * Get /ajax/load/channels
 */
app.get('/ajax/load/channels', function(req, res) {
  var sequence = futures.sequence(), err, user, channels;

  sequence
    .then(function(next, err) {
      Pagetty.loadUser(user_id, function(u) {
        user = u;
        next();
      });
    })
    .then(function(next, err) {
      Pagetty.loadUserChannels(user, function(c) {
        channels = c;
        next();
      });
    })
    .then(function(next, err) {
      res.send(channels)
    });
});

/**
 * Get /ajax/update
 */
app.get('/ajax/update', function(req, res) {
  var sequence = futures.sequence(), err, user, channels;

  sequence
    .then(function(next, err) {
      Pagetty.loadUser(user_id, function(u) {
        user = u;
        next();
      });
    })
    .then(function(next, err) {
      Pagetty.loadUserChannelUpdates(user, req.param('state'), function(updates) {
        console.log('Sending ajax/update response.');
        res.json(updates);
      });
    });
});

/**
 * GET new channel form.
 */
app.get('/channel/add', function(req, res) {
  var channel = {components: [{}]};
  res.render('channel_form', {channel: channel});
});

/**
 * Validate channel data, try to fetch some items from the channel.
 */
app.post('/channel/validate', function(req, res) {
  var channel = req.body;
  var errors = Pagetty.validateChannel(channel);

  if (errors.length) {
    res.json(errors, 400);
  }
  else {
    Pagetty.fetchChannelItems(channel, function(err, channel) {
      if (err) {
        res.json({fetch_error: err}, 400);
      }
      else {
        res.json(channel, 200);
      }
    });
  }
});

/**
 * Dummy callback for invisible iframes.
 */
app.post('/null', function(req, res) {
  res.send(200);
});

/**
 * Display a list of available channels.
 */
app.get('/channels', function(req, res) {
  Pagetty.loadAllChannels(function(err, channels) {
    if (err) {
      res.send(500);
    }
    else {
      res.render('channels', {channels: _.toArray(channels)});
    }
  });
});

/**
 * Display a preview of a single channel.
 */
app.get('/preview/:id', function(req, res) {
  Pagetty.loadChannel(req.params.id, function(err, channel) {
    if (err) {
      res.send(404);
    }
    else {
      res.render('preview', {channel: channel});
    }
  });
});

/**
 * Save channel data.
 */
app.post('/channel/save', function(req, res) {
  var channel = req.body;
  var errors = Pagetty.validateChannel(channel);

  if (errors.length) {
    res.json(errors, 400);
  }
  else {
    Pagetty.fetchChannelItems(channel, function(err, channel) {
      if (err) {
        res.json({fetch_error: err}, 400);
      }
      else {
        if (channel._id) {
          var id = channel._id;

          Pagetty.updateChannel(channel, function(err) {
            if (err) {
              res.json({error: err}, 400);
            }
            else {
              res.json({_id: id}, 200);
            }
          });
        }
        else {
          Pagetty.createChannel(channel, function(err, doc) {
            if (err) {
              res.json({error: err}, 400);
            }
            else {
              res.json({_id: doc._id}, 200);
            }
          });
        }
      }
    });
  }
});

/**
 * Get new channel form.
 */
app.get('/channel/edit/:id', function(req, res) {
  Pagetty.loadChannel(req.params.id, function(err, channel) {
    if (err) {
      res.send(404);
    }
    else {
      res.render('channel_form', {channel: channel});
    }
  })
});

/**
 * Initialize and start the server.
 */
Pagetty.init(config, function () {
  console.log("Starting server on port " + config.port);
  app.listen(config.port);
});
