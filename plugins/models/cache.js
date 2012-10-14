exports.attach = function(options) {
  var app = this;
  var mongoose = require('mongoose');

  var cacheSchema = mongoose.Schema({
    url: {type: String, index: {unique: true}},
    created: Date,
    content: Buffer,
  });

  this.cache = this.db.model('Cache', cacheSchema, 'cache');
}
