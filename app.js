var cluster = require('cluster');

if (cluster.isMaster) {
  console.log('Starting cluster master');
  
  // Fork workers.
  for (var i = 0; i < require('os').cpus().length; i++) {
    cluster.fork();
  }
  
  // When a worker dies, launch another one.
  cluster.on('exit', function(worker, code, signal) {
    console.log('Worker ' + worker.process.pid + ' died, starting another one.');
    cluster.fork();
  });  
}
else {
  console.log('Starting worker #' + cluster.worker.id);
  
  var broadway = require('broadway');  
  var app = new broadway.App();
   
  // Load plugins.
  app.use(require('./plugins/main.js'));
  app.use(require('./plugins/server.js'));

  // Launcher.
  app.init(function (err) {
    if (err) console.log(err);
  });
}
