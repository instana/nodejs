/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const assert = require('assert');
const async = require('async');
const AllocationSampler = require('../../lib/samplers/allocation_sampler').AllocationSampler;
const supportedVersion = require('@_local/core').tracing.supportedVersion;
const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('AllocationSampler', () => {
  let profiler;

  beforeEach(() => {
    profiler = global.profiler;
  });

  describe('startSampler()', () => {
    it('should record allocation profile', done => {
      const sampler = new AllocationSampler(profiler);
      if (!sampler.test()) {
        done();
        return;
      }
      sampler.reset();

      function runTest(callback) {
        sampler.startSampler();
        setTimeout(() => {
          sampler.stopSampler();
          const profile = sampler.buildProfile(1000, 10);

          // console.log(util.inspect(profile.toJson(), {showHidden: false, depth: null}))
          callback(null, JSON.stringify(profile.toJson()).match(/allocation_sampler.test.js/));
        }, 1000);

        const mem1 = [];
        function memLeak() {
          const mem2 = [];
          for (let i = 0; i < 200000; i++) {
            mem1.push(Math.random());
            mem2.push(Math.random());
          }
        }

        memLeak();
      }

      async.retry({ times: 5 }, runTest, (err, success) => {
        assert(success);
        done();
      });
    });
  });
});
