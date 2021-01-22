/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. 2020
 */

'use strict';

const assert = require('assert');
const AutoProfiler = require('../lib/auto_profiler').AutoProfiler;

beforeEach(() => {
  global.profiler = new AutoProfiler();

  global.profiler.sendProfiles = function(profiles, callback) {
    // eslint-disable-next-line no-console
    callback();
  };

  global.profiler.getExternalPid = function() {
    return '123';
  };

  global.profiler.start({
    debug: true,
    disableTimers: true
  });
});

afterEach(() => {
  global.profiler.destroy();
  global.profiler = undefined;
});

describe('AutoProfiler', () => {
  let profiler;
  let origFlush;

  beforeEach(() => {
    profiler = global.profiler;
    profiler.allocationSamplerScheduler.started = false;
    profiler.asyncSamplerScheduler.started = false;
    origFlush = profiler.profileRecorder.flush;
    profiler.profileRecorder.flush = function(callback) {
      return callback(null);
    };
  });

  afterEach(() => {
    profiler = global.profiler;
    profiler.options.disableAllocationSampler = false;
    profiler.options.disableAsyncSampler = false;
    profiler.profileRecorder.flush = origFlush;
  });

  describe('profile()', () => {
    it('should profile with CPU sampler', done => {
      const span = profiler.profile();
      assert(span);

      // do some work
      for (let i = 0; i < 60 * 10000; i++) {
        /* eslint-disable no-unused-vars */
        let text = 'text' + i;
        text += 'text2';
      }

      profiler.cpuSamplerScheduler.profileStartTs =
        Date.now() - profiler.cpuSamplerScheduler.config.reportInterval - 10000;
      span.stop(() => {
        assert.equal(profiler.profileRecorder.queue.length, 1);
        done();
      });
    });
  });

  describe('matchVersion()', () => {
    beforeEach(() => {
      profiler = global.profiler;
    });

    it('should match version', done => {
      assert.equal(profiler.matchVersion(null, null), true);
      assert.equal(profiler.matchVersion('0.0.0', 'v100.100.100'), true);
      assert.equal(profiler.matchVersion('v100.100.100', 'v110.110.110'), false);

      done();
    });
  });
});
