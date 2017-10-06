var assert = require('assert');
const qyu = require('../qyu');

describe('basic qyu usage', function() {

  it('qyu() can be instantiated without options', function() {
    qyu();
  });

  it('start() should return a promise', function() {
    const q = qyu();
    assert(q.start().then);
  });

});
