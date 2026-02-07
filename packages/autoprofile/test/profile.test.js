/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const assert = require('assert');
const CallSite = require('../lib/profile').CallSite;
const Profile = require('../lib/profile').Profile;
const supportedVersion = require('@_local/core').tracing.supportedVersion;
const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('Profile', () => {
  let profiler;

  beforeEach(() => {
    profiler = global.profiler;
  });

  describe('toJson()', () => {
    it('should convert profile to json', done => {
      const roots = new Set();

      const root1 = new CallSite(profiler, 'meth1', 'file1', 1);
      root1.measurement = 10;
      root1.numSamples = 1;
      roots.add(root1);

      const child1 = new CallSite(profiler, 'meth2', 'file2', 2);
      child1.measurement = 5;
      child1.numSamples = 1;
      root1.addChild(child1);

      const profile = new Profile(
        profiler,
        Profile.c.CATEGORY_CPU,
        Profile.c.TYPE_CPU_USAGE,
        Profile.c.UNIT_SAMPLE,
        roots,
        20000,
        120000
      );

      // console.log(util.inspect(profile.toJson(), {showHidden: false, depth: null}))

      assert.deepEqual(profile.toJson(), {
        pid: profile.processId,
        id: profile.id,
        runtime: 'nodejs',
        category: 'cpu',
        type: 'cpu-usage',
        unit: 'sample',
        roots: [
          {
            method_name: 'meth1',
            file_name: 'file1',
            file_line: 1,
            measurement: 10,
            num_samples: 1,
            children: [
              {
                method_name: 'meth2',
                file_name: 'file2',
                file_line: 2,
                measurement: 5,
                num_samples: 1,
                children: []
              }
            ]
          }
        ],
        duration: 20000,
        timespan: 120000,
        timestamp: profile.timestamp
      });

      done();
    });
  });
});

describe('CallSite', () => {
  let profiler;

  beforeEach(() => {
    profiler = global.profiler;
  });

  describe('depth()', () => {
    it('should return max depth', done => {
      const root = new CallSite(profiler, 'root', '', 0);

      const child1 = new CallSite(profiler, 'child1', '', 0);
      root.addChild(child1);

      const child2 = new CallSite(profiler, 'child2', '', 0);
      root.addChild(child2);

      const child2child1 = new CallSite(profiler, 'child2child1', '', 0);
      child2.addChild(child2child1);

      assert.equal(root.depth(), 3);
      assert.equal(child1.depth(), 1);
      assert.equal(child2.depth(), 2);

      done();
    });
  });

  describe('addChild()', () => {
    it('should add child', done => {
      const root = new CallSite(profiler, 'root', '', 0);

      const child1 = new CallSite(profiler, 'child1', '', 0);
      root.addChild(child1);

      assert.deepEqual(child1, root.findChild('child1', '', 0));

      done();
    });
  });

  describe('removeChild()', () => {
    it('should remove child', done => {
      const root = new CallSite(profiler, 'root', '', 0);

      const child1 = new CallSite(profiler, 'child1', '', 0);
      root.removeChild(child1);

      assert(!root.findChild('child1', '', 0));

      done();
    });
  });

  describe('increment()', () => {
    it('should increment value', done => {
      const b = new CallSite(profiler, 'root', '', 0);
      b.increment(0.1, 1);
      b.increment(0.2, 2);

      assert.equal(b.measurement.toFixed(1), 0.3);
      assert.equal(b.numSamples, 3);
      done();
    });
  });
});
