/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const assert = require('assert');
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('Utils', () => {
  let profiler;

  beforeEach(() => {
    profiler = global.profiler;
  });

  describe('generateUuid()', () => {
    it('should generate uuid', done => {
      const uuid1 = profiler.utils.generateUuid();
      const uuid2 = profiler.utils.generateUuid();

      assert.equal(uuid1.length, 32);
      assert.notEqual(uuid1, uuid2);

      done();
    });
  });

  describe('generateSha1()', () => {
    it('should generate sha1', done => {
      const sha1 = profiler.utils.generateSha1('some text');
      assert.equal(sha1, '37aa63c77398d954473262e1a0057c1e632eda77');

      done();
    });
  });
});
