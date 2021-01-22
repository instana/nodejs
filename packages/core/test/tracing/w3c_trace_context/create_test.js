/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. 2020
 */

'use strict';

const { expect } = require('chai');

const create = require('../../../src/tracing/w3c_trace_context/create');
const { createEmptyUnsampled } = create;

const version00 = '00';
const traceId32Char = '0123456789abcdeffedcbc9876543210';
const traceid16Char = '0123456789abcdef';
const parentId = '02468acefdb97531';

describe('tracing/w3c-trace-context create', () => {
  [true, false].forEach(longTraceId =>
    [undefined, true, false].forEach(sampled => registerFromInstanaIdTest.bind(null, longTraceId, sampled)())
  );

  function registerFromInstanaIdTest(longTraceId, sampled) {
    const instanaTraceId = longTraceId ? traceId32Char : traceid16Char;
    const expectedTraceId = longTraceId ? traceId32Char : `0000000000000000${traceid16Char}`;
    const expectedSampled = sampled !== false;
    const expectedFlags = sampled !== false ? '01' : '00';

    const testTitleSuffix = `(${idLengthTitle(longTraceId)}, sampled: ${sampled})`;

    it(`should create a trace context from Instana IDs ${testTitleSuffix}`, () => {
      const traceContext = create(instanaTraceId, parentId, sampled);

      expect(traceContext.traceParentValid).to.be.true;
      expect(traceContext.version).to.equal(version00);
      expect(traceContext.foreignTraceId).to.equal(expectedTraceId);
      expect(traceContext.foreignParentId).to.equal(parentId);
      expect(traceContext.sampled).to.equal(expectedSampled);
      expect(traceContext.renderTraceParent()).to.equal(`${version00}-${expectedTraceId}-${parentId}-${expectedFlags}`);

      expect(traceContext.traceStateValid).to.be.true;
      expect(traceContext.traceStateHead).to.not.exist;
      expect(traceContext.instanaTraceId).to.equal(instanaTraceId);
      expect(traceContext.instanaParentId).to.equal(parentId);
      expect(traceContext.traceStateTail).to.not.exist;
      expect(traceContext.hasTraceState()).to.be.true;
      expect(traceContext.renderTraceState()).to.equal(`in=${instanaTraceId};${parentId}`);

      expect(traceContext.getMostRecentForeignTraceStateMember()).to.be.undefined;
    });
  }

  [true, false].forEach(longTraceId => registerEmptyUnsampledTest.bind(null, longTraceId)());

  function registerEmptyUnsampledTest(longTraceId) {
    const traceId = longTraceId ? traceId32Char : traceid16Char;
    const expectedTraceId = longTraceId ? traceId32Char : `0000000000000000${traceid16Char}`;

    const testTitleSuffix = `(${idLengthTitle(longTraceId)})`;

    it(`should create an empty unsampled trace context ${testTitleSuffix}`, () => {
      const traceContext = createEmptyUnsampled(traceId, parentId);

      expect(traceContext.traceParentValid).to.be.true;
      expect(traceContext.version).to.equal(version00);
      expect(traceContext.foreignTraceId).to.equal(expectedTraceId);
      expect(traceContext.foreignParentId).to.equal(parentId);
      expect(traceContext.sampled).to.be.false;
      expect(traceContext.renderTraceParent()).to.equal(`${version00}-${expectedTraceId}-${parentId}-00`);

      expect(traceContext.traceStateValid).to.be.true;
      expect(traceContext.traceStateHead).to.not.exist;
      expect(traceContext.instanaTraceId).to.not.exist;
      expect(traceContext.instanaParentId).to.not.exist;
      expect(traceContext.traceStateTail).to.not.exist;
      expect(traceContext.hasTraceState()).to.be.false;
      expect(traceContext.renderTraceState()).to.equal('');

      expect(traceContext.getMostRecentForeignTraceStateMember()).to.be.undefined;
    });
  }
});

function idLengthTitle(shortId) {
  return shortId ? 'narrow' : 'wide';
}
