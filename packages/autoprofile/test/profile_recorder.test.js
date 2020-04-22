'use strict';

const assert = require('assert');


describe('ProfileRecorder', () => {
  let profiler;

  beforeEach(() => {
    profiler = global.profiler;
  });


  describe('flush()', () => {
    it('should send profiles and empty the queue', (done) => {
      let lastProfiles;

      profiler.profileRecorder.reset();

      profiler.sendProfiles = function(profiles, callback) {
        lastProfiles = profiles;

        setTimeout(() => {
          callback(null);

          assert.equal(profiler.profileRecorder.queue.length, 0);
          done();
        }, 1);
      };

      profiler.profileRecorder.record({a: 1});


      profiler.profileRecorder.flush(() => {
        assert.equal(lastProfiles[0].a, 1);
      });
    });
  });
});
