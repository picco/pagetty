const
  user_id = 'b8ac4a414a81f75ff0e2452cac001538';

var
  pagetty = require('./pagetty.js'),
  express = require('express'),
  futures = require('futures'),
  user = false,
  channels = [],

app = express.createServer();
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(express.static(__dirname + '/public'));
app.use(express.bodyParser());
app.use('/', express.errorHandler({dump: true, stack: true}));
app.enable("jsonp callback");

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

pagetty.init(function () {
  app.listen(80);
});
