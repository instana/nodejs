/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const assert = require('assert');
const supportedVersion = require('@_local/core').tracing.supportedVersion;
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
});
