var cluster = require('cluster');

/*
require('nodetime').profile({
  accountKey: 'c2087d25f074a96e5e842cb25d957f2a58d6cba1',
  appName: 'Pagetty'
});
*/


if (cluster.isMaster) {
  var stamp = new Date().getTime();
  var worker_env = {build: stamp};
  var cpus = require('os').cpus().length;

  //cpus = 1;

  console.log('Starting cluster master with ' + cpus + ' workers');

  // Fork workers.
  for (var i = 0; i < cpus; i++) {
    cluster.fork(worker_env);
  }

  // When a worker dies, launch another one.
  cluster.on('exit', function(worker, code, signal) {
    console.log('Worker ' + worker.process.pid + ' died, starting another one.');
    cluster.fork(worker_env);
  });
}
else {
  console.log('Starting worker #' + cluster.worker.id);

  var broadway = require('broadway');
  var app = new broadway.App();

  app.worker = cluster.worker;
  app.build = process.env.build;

  // Load plugins.
  app.use(require('./plugins/main.js'));
  app.use(require('./plugins/server.js'));

  // Launcher.
  app.init(function (err) {
    if (err) console.log(err);
  });
}
