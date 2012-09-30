exports.attach = function(options) {
  var app = this;
  var mongoose = require('mongoose');

  var cacheSchema = mongoose.Schema({
    url: String,
    created: Date,    
    content: Buffer,
  });

  this.cache = this.db.model('Cache', cacheSchema, 'cache');
}
