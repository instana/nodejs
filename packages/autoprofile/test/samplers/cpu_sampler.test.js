
'use strict';

const CpuSampler = require('../../lib/samplers/cpu_sampler').CpuSampler;
const assert = require('assert');
const util = require('util');
const async = require('async');


describe('CpuSampler', () => {
  let profiler;

  beforeEach(() => {
    profiler = global.profiler;
  });


  describe('startProfile()', () => {
    it('should record profile', (done) => {
      let sampler = new CpuSampler(profiler);
      if (!sampler.test()) {
        done();
        return;
      }
      sampler.reset();

      function runTest(callback) {
        sampler.startSampler();

        setTimeout(() => {
          sampler.stopSampler();
          let profile = sampler.buildProfile(500, 10);

          // console.log(util.inspect(profile.toJson(), {showHidden: false, depth: null}))
          callback(null, JSON.stringify(profile.toJson()).match(/cpu_sampler.test.js/));
        }, 500);

        for (let i = 0; i < 60 * 20000; i++) {
          let text = 'text' + i;
          text += 'text2';
        }
      }

      async.retry({times: 5}, runTest, (err, success) => {
        assert(success);
        done();
      });
    });
  });
});
