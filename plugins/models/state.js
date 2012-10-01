exports.attach = function(options) {
  var app = this;
  var mongoose = require('mongoose');

  var stateSchema = mongoose.Schema({
    user: mongoose.Schema.Types.ObjectId,
    data: mongoose.Schema.Types.Mixed,
  });

  this.state = this.db.model('State', stateSchema, 'state');
}
