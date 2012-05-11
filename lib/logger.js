var winston = require("winston");

winston.loggers.add("log", {loggly: {
  inputToken: "5b22ef95-9494-4f6d-b20c-fc58614814ed",
  subdomain: "pagetty",
  handleExceptions: false
}});

winston.loggers.add("accessLog", {loggly: {
  inputToken: "8c173e34-0ed6-44e4-a49b-a0a524d08bd2",
  subdomain: "pagetty"
}});

module.exports.log = winston.loggers.get("log");
module.exports.accessLog = winston.loggers.get("accessLog");