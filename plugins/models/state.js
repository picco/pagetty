exports.attach = function(options) {
  var app = this;
  var mongoose = require('mongoose');

  var stateSchema = mongoose.Schema({
    user: {type: mongoose.Schema.Types.ObjectId, index: {unique: true}},
    data: mongoose.Schema.Types.Mixed,
  });

  this.state = this.db.model('State', stateSchema, 'state');
}
