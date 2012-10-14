exports.attach = function(options) {
  var app = this;
  var mongoose = require('mongoose');

  var historySchema = mongoose.Schema({
    channel: {type: mongoose.Schema.Types.ObjectId, index: true},
    item: mongoose.Schema.Types.Mixed,
  });

  this.history = this.db.model('History', historySchema, 'history');
}
