exports.attach = function(options) {
  var app = this;
  var mongoose = require('mongoose');

  var ruleSchema = mongoose.Schema({
    url: String,
    domain: String,
    item: String,
    target: mongoose.Schema.Types.Mixed,
    image: mongoose.Schema.Types.Mixed,
    score: mongoose.Schema.Types.Mixed,
    comments: mongoose.Schema.Types.Mixed,
  });

  this.rule = this.db.model('Rule', ruleSchema, 'rules');
}
