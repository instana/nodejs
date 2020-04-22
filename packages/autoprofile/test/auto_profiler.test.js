'use strict';

const assert = require('assert');
const AutoProfiler = require('../lib/auto_profiler').AutoProfiler;

beforeEach(() => {
  global.profiler = new AutoProfiler();

  global.profiler.sendProfiles = function(profiles, callback) {
    console.log('Received profiles', profiles);
  };

  global.profiler.getExternalPid = function() {
    return '123';
  };

  global.profiler.start({debug: true});
});

afterEach(() => {
  global.profiler.destroy();
  global.profiler = undefined;
});


describe('AutoProfiler', () => {
  let profiler;

  beforeEach(() => {
    profiler = global.profiler;
  });


  describe('matchVersion()', () => {
    it('should match version', (done) => {
      assert.equal(profiler.matchVersion(null, null), true);
      assert.equal(profiler.matchVersion('0.0.0', 'v100.100.100'), true);
      assert.equal(profiler.matchVersion('v100.100.100', 'v110.110.110'), false);

      done();
    });
  });
});
