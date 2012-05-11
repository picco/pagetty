var forever = require("forever");
var monitor = forever.startDaemon("app.js", {
  pidFile: ".pid",
  
});

monitor.on("start", function () {
  conole.log("App process started.");
  forever.startServer(monitor);
});

monitor.on("exit", function () {
  conole.log("App process exited.");
});
