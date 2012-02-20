const
  user_id = 'b8ac4a414a81f75ff0e2452cac001538';

var
  config = require('config').server,
  pagetty = require('./pagetty.js'),
  express = require('express'),
  futures = require('futures'),
  jade = require('jade'),
  mongoose = require('mongoose'),
  Schema = mongoose.Schema,
  ObjectId = Schema.ObjectId,
  user = false,
  channels = [];

app = express.createServer();
app.set('view engine', 'jade');
app.set('views', __dirname + '/views');
app.use(express.static(__dirname + '/public'));
app.use(express.bodyParser());
app.use(express.cookieParser());
app.use(express.session({secret: "nõude"}));
app.use(express.errorHandler({dump: true, stack: true}));
app.dynamicHelpers({
  messages: require('express-messages')
});

/**
 * Get /
 */
app.get('/', function(req, res) {
  var sequence = futures.sequence(), err, user, channels;

  sequence
    .then(function(next, err) {
      pagetty.loadUser(user_id, function(u) {
        user = u;
        next();
      });
    })
    .then(function(next, err) {
      pagetty.loadUserChannels(user, function(c) {
        channels = c;
        next();
      });
    })
    .then(function(next, err) {
      console.log('Sending back response to the user.');
      res.render('index', {title: 'Pagetty', channels: channels, channels_json: JSON.stringify(channels)});
    });
});

/**
 * Get /ajax/load/channels
 */
app.get('/ajax/load/channels', function(req, res) {
  var sequence = futures.sequence(), err, user, channels;

  sequence
    .then(function(next, err) {
      pagetty.loadUser(user_id, function(u) {
        user = u;
        next();
      });
    })
    .then(function(next, err) {
      pagetty.loadUserChannels(user, function(c) {
        channels = c;
        next();
      });
    })
    .then(function(next, err) {
      console.log('Sending ajax/load/channels response.');
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
      pagetty.loadUser(user_id, function(u) {
        user = u;
        next();
      });
    })
    .then(function(next, err) {
      pagetty.loadUserChannelUpdates(user, req.param('state'), function(updates) {
        console.log('Sending ajax/update response.');
        res.json(updates);
      });
    });
});

/**
 * Create new channel form.
 */
app.get('channel/add', function(req, res) {
  res.send('hahaa');
});

/**
 * API, Create new channel callback.
 */
app.post('/api/channel', function(req, res) {
  var channelModel = require('./models/channel.js');
  var channel = new channelModel(req.body);

  channel.save(function (err) {
    if (err) {

    }
    else {

    }
    res.send({status: 'OKIDOKI'});
    console.dir(err);
  });
});

/**
 * Initialize and start the server.
 */
pagetty.init(config, function () {
  console.log("Starting server on port " + config.port);
  app.listen(config.port);
});
