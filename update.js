var
  config = require('config').server,
  cp = require('child_process'),
  break_timeout = 10;

function update() {
  var n = cp.fork(__dirname + '/update_worker.js');

  n.send({config: config});

  n.on('exit', function (code, signal) {
    setTimeout(update, break_timeout * 1000);
  });
}

update();