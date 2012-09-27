var
  expect  = require('expect.js'),
  pagetty = require('../lib/pagetty.js');
  
describe('pagetty', function() {
  before(function(done) {
    pagetty.init(function(self) {
      done();
    });
  });
  
  describe('init', function() {
    it('should connect to the database', function() {
      expect(pagetty.db.serverConfig.connected).to.be(true);
    });    
  })
})