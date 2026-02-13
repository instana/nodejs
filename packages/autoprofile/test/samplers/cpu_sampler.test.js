/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const assert = require('assert');
const async = require('async');
const CpuSampler = require('../../lib/samplers/cpu_sampler').CpuSampler;
const supportedVersion = require('@_local/core').tracing.supportedVersion;
const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('CpuSampler', () => {
  let profiler;

  beforeEach(() => {
    profiler = global.profiler;
  });

  describe('startProfile()', () => {
    it('should record profile', done => {
      const sampler = new CpuSampler(profiler);
      if (!sampler.test()) {
        done();
        return;
      }
      sampler.reset();

      function runTest(callback) {
        sampler.startSampler();

        setTimeout(() => {
          sampler.stopSampler();
          const profile = sampler.buildProfile(500, 10);

          callback(null, JSON.stringify(profile.toJson()).match(/cpu_sampler.test.js/));
        }, 500);

        // do some work
        for (let i = 0; i < 60 * 20000; i++) {
          /* eslint-disable no-unused-vars */
          let text = `text${i}`;
          text += 'text2';
        }
      }

      async.retry({ times: 5 }, runTest, (err, success) => {
        assert(success);
        done();
      });
    });
  });
});
