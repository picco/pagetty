exports.attach = function(options) {
  var app = this;
  var mongoose = require('mongoose');

  var ruleSchema = mongoose.Schema({
    type: String,
    domain: String,
    item: String,
    target: mongoose.Schema.Types.Mixed,
    title: mongoose.Schema.Types.Mixed,
    image: mongoose.Schema.Types.Mixed,
    score: mongoose.Schema.Types.Mixed,
    comments: mongoose.Schema.Types.Mixed,
  });

  // Rules hava a unique compound index on type and domain.
  ruleSchema.index({type: 1, domain: 1}, {unique: true});

  this.rule = this.db.model('Rule', ruleSchema, 'rules');
}
