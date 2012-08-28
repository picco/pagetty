module.exports = {
  connect: function(config, callback) {
    this.conn = new mongodb.Db(config.db_name, new mongodb.Server(config.db_host, config.db_port));
    this.conn.open(function(err, client) {
      if (err) throw err;

      this.channels = new mongodb.Collection(client, "channels");
      this.rules = new mongodb.Collection(client, "rules");
      this.users = new mongodb.Collection(client, "users");
      this.history = new mongodb.Collection(client, "history");
      this.sessions = new mongodb.Collection(client, "sessions");

      // Create indexes if necessary.
      // self.channels.ensureIndex({"items.id": 1}, {unique: true, dropDups: true}, function(err) { console.log(err) });

      callback();
    });
  }
}
