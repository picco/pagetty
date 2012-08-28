module.exports = function(db) {
  return function Db(db) {
    this.db = db;

    /**
     * Load a given user from database.
     */
    this.load = function(id, callback) {
      this.db.users.findOne({_id: this.objectId(id)}, function(err, user) {
        if (err) throw err;
        // Remove the password hash, since user objects will be sent to the browser.
        delete user.pass;
        callback(user);
      });
    }
  }
}
