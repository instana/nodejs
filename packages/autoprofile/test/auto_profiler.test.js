/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const assert = require('assert');
const supportedVersion = require('@_local/core').tracing.supportedVersion;
const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('AutoProfiler', () => {
  let profiler;
  let origFlush;

  beforeEach(() => {
    profiler = global.profiler;
    profiler.allocationSamplerScheduler.started = false;
    profiler.asyncSamplerScheduler.started = false;
    origFlush = profiler.profileRecorder.flush;
    profiler.profileRecorder.flush = function (callback) {
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
        let text = `text${i}`;
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
});
