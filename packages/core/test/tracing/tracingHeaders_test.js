/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const { expect } = require('chai');
const { fail } = expect;

const tracingHeaders = require('../../src/tracing/tracingHeaders');

// X-INSTANA- values
const instana16CharTraceId = '0123456789abcdef';
const instana32CharTraceIdLeftHalf = 'a0b1c2d3e4f56789';
const instana32CharTraceIdRightHalf = '98765f4e3d2c1b0a';
const instana32CharTraceId = `${instana32CharTraceIdLeftHalf}${instana32CharTraceIdRightHalf}`;
const instanaSpanId = '02468acefdb97531';

// W3C trace context values
const version00 = '00';
const traceParentTraceIdLeftHalf = '0af7651916cd43dd';
const traceParentTraceIdRightHalf = '8448eb211c80319c';
const traceParentTraceId = `${traceParentTraceIdLeftHalf}${traceParentTraceIdRightHalf}`;
const traceParentParentId = 'b7ad6b7169203331';
const flags = '01';
const traceParent = `${version00}-${traceParentTraceId}-${traceParentParentId}-${flags}`;
const traceStateWithoutInstana = 'rojo=00f067aa0ba902b7,congo=t61rcWkgMzE';
const instanaWideTraceStateValue = `in=${instana32CharTraceId};${instanaSpanId}`;
const instanaNarrowTraceStateValue = `in=${instana16CharTraceId};${instanaSpanId}`;
const traceStateWithInstanaWide = `rojo=00f067aa0ba902b7,congo=t61rcWkgMzE,${instanaWideTraceStateValue}`;
const traceStateWithInstanaNarrow = `rojo=00f067aa0ba902b7,congo=t61rcWkgMzE,${instanaNarrowTraceStateValue}`;
const traceStateWithInstanaLeftMostNarrow = `${instanaNarrowTraceStateValue},rojo=00f067aa0ba902b7,congo=t61rcWkgMzE`;

describe('tracing/headers', () => {
  it('should read X-INSTANA- headers', () => {
    const context = tracingHeaders.fromHttpRequest({
      headers: {
        'x-instana-t': instana16CharTraceId,
        'x-instana-s': instanaSpanId
      }
    });

    expect(context).to.be.an('object');
    expect(context.traceId).to.equal(instana16CharTraceId);
    expect(context.parentId).to.equal(instanaSpanId);
  });

  it('should read 128 bit X-INSTANA-T and limit it to 64 bit', () => {
    const context = tracingHeaders.fromHttpRequest({
      headers: {
        'x-instana-t': instana32CharTraceId,
        'x-instana-s': instanaSpanId
      }
    });

    expect(context).to.be.an('object');
    expect(context.traceId).to.equal(instana32CharTraceIdRightHalf);
    expect(context.parentId).to.equal(instanaSpanId);
    expect(context.longTraceId).to.equal(instana32CharTraceId);
  });

  it('should not set longTraceId if X-INSTANA-T is 64 bit', () => {
    const context = tracingHeaders.fromHttpRequest({
      headers: {
        'x-instana-t': instana16CharTraceId,
        'x-instana-s': instanaSpanId
      }
    });
    expect(context.longTraceId).to.not.exist;
  });

  it('should not set usedTraceParent when X-INSTANA-T is present', () => {
    const context = tracingHeaders.fromHttpRequest({
      headers: {
        'x-instana-t': instana16CharTraceId,
        'x-instana-s': instanaSpanId
      }
    });
    expect(context.usedTraceParent).to.be.false;
  });

  it('should not set usedTraceParent when X-INSTANA-T is present (128 bit)', () => {
    const context = tracingHeaders.fromHttpRequest({
      headers: {
        'x-instana-t': instana32CharTraceId,
        'x-instana-s': instanaSpanId
      }
    });
    expect(context.usedTraceParent).to.be.false;
  });

  it('should use X-INSTANA- headers (with 128 bit trace ID) to create a new W3C trace context', () => {
    const context = tracingHeaders.fromHttpRequest({
      headers: {
        'x-instana-t': instana32CharTraceId,
        'x-instana-s': instanaSpanId
      }
    });
    const w3cTraceContext = context.w3cTraceContext;
    expect(w3cTraceContext).to.be.an('object');
    expect(w3cTraceContext.traceParentTraceId).to.equal(instana32CharTraceId);
    expect(w3cTraceContext.traceParentParentId).to.equal(instanaSpanId);
    expect(w3cTraceContext.sampled).to.be.true;
    expect(w3cTraceContext.instanaTraceId).to.equal(instana32CharTraceId);
    expect(w3cTraceContext.instanaParentId).to.equal(instanaSpanId);
  });

  it('should use 64 bit X-INSTANA-T to create a new W3C trace context and zero-pad it', () => {
    const context = tracingHeaders.fromHttpRequest({
      headers: {
        'x-instana-t': instana16CharTraceId,
        'x-instana-s': instanaSpanId
      }
    });
    const w3cTraceContext = context.w3cTraceContext;
    expect(w3cTraceContext).to.be.an('object');
    expect(w3cTraceContext.traceParentTraceId).to.equal(`0000000000000000${instana16CharTraceId}`);
    expect(w3cTraceContext.traceParentParentId).to.equal(instanaSpanId);
    expect(w3cTraceContext.sampled).to.be.true;
    expect(w3cTraceContext.instanaTraceId).to.equal(instana16CharTraceId);
    expect(w3cTraceContext.instanaParentId).to.equal(instanaSpanId);
  });

  describe('X-INSTANA-L', () => {
    it('should read level 0 from X-INSTANA-L', () => {
      const context = tracingHeaders.fromHttpRequest({
        headers: {
          'x-instana-l': '0'
        }
      });
      expect(context.level).to.equal('0');
    });

    it('should read level 1 from X-INSTANA-L', () => {
      const context = tracingHeaders.fromHttpRequest({
        headers: {
          'x-instana-l': '1'
        }
      });
      expect(context.level).to.equal('1');
    });

    it('should ignore invalid one char values from X-INSTANA-L', () => {
      const context = tracingHeaders.fromHttpRequest({
        headers: {
          'x-instana-l': '2'
        }
      });
      expect(context.level).to.not.exist;
    });

    it('should read level from X-INSTANA-L with trailing content', () => {
      const context = tracingHeaders.fromHttpRequest({
        headers: {
          'x-instana-l': '0trailing'
        }
      });
      expect(context.level).to.equal('0');
    });

    it('should ignore invalid level in X-INSTANA-L with trailing content', () => {
      const context = tracingHeaders.fromHttpRequest({
        headers: {
          'x-instana-l': '2trailing'
        }
      });
      expect(context.level).to.not.exist;
    });

    it('should read level and correlation info from X-INSTANA-L', () => {
      const context = tracingHeaders.fromHttpRequest({
        headers: {
          'x-instana-l': '1,correlationType=web;correlationId=abcdef123456789'
        }
      });
      expect(context.level).to.equal('1');
      expect(context.correlationType).to.equal('web');
      expect(context.correlationId).to.equal('abcdef123456789');
    });

    it('should read level and correlation info from X-INSTANA-L with whitespaces', () => {
      const context = tracingHeaders.fromHttpRequest({
        headers: {
          'x-instana-l': '1 ,  correlationType=  web  ;  correlationId=  abcdef123456789  '
        }
      });
      expect(context.level).to.equal('1');
      expect(context.correlationType).to.equal('web');
      expect(context.correlationId).to.equal('abcdef123456789');
    });

    it('should ignore X-INSTANA-T/-S when correlation info is present', () => {
      const context = tracingHeaders.fromHttpRequest({
        headers: {
          'x-instana-l': '1,correlationType=web;correlationId=abcdef123456789',
          'x-instana-t': instana32CharTraceId,
          'x-instana-s': instanaSpanId
        }
      });
      expect(context.traceId).to.be.a('string');
      expect(context.traceId).to.have.lengthOf(16);
      expect(context.traceId).to.not.equal(instana32CharTraceId);
      expect(context.parentId).to.not.exist;
    });

    it('should discard correlation info if not sampling', () => {
      const context = tracingHeaders.fromHttpRequest({
        headers: {
          'x-instana-l': '0,correlationType=web;correlationId=abcdef123456789'
        }
      });
      expect(context.level).to.equal('0');
      expect(context.correlationType).to.not.exist;
      expect(context.correlationId).to.not.exist;
    });
  });

  describe('X-INSTANA-SYNTHETIC', () => {
    it('should read the synthetic marker from headers', () => {
      const context = tracingHeaders.fromHttpRequest({
        headers: {
          'x-instana-synthetic': '1'
        }
      });
      expect(context.synthetic).to.be.true;
    });
  });

  it('should use W3C traceparent IDs if X-INSTANA- is missing', () => {
    const context = tracingHeaders.fromHttpRequest({
      headers: {
        traceparent: traceParent
      }
    });

    expect(context).to.be.an('object');
    expect(context.traceId).to.equal(traceParentTraceIdRightHalf);
    expect(context.parentId).to.equal(traceParentParentId);
    expect(context.usedTraceParent).to.be.true;
    expect(context.longTraceId).to.equal(traceParentTraceId);
    const w3cTraceContext = context.w3cTraceContext;
    expect(w3cTraceContext).to.be.an('object');
    expect(w3cTraceContext.traceParentTraceId).to.equal(traceParentTraceId);
    expect(w3cTraceContext.traceParentParentId).to.equal(traceParentParentId);
    expect(w3cTraceContext.sampled).to.be.true;
    expect(w3cTraceContext.instanaTraceId).to.not.exist;
    expect(w3cTraceContext.instanaParentId).to.not.exist;
  });

  it('should use W3C traceparent IDs if X-INSTANA- is missing and tracestate has no "in" key-value pair', () => {
    const context = tracingHeaders.fromHttpRequest({
      headers: {
        traceparent: traceParent,
        tracestate: traceStateWithoutInstana
      }
    });

    expect(context).to.be.an('object');
    expect(context.traceId).to.equal(traceParentTraceIdRightHalf);
    expect(context.parentId).to.equal(traceParentParentId);
    expect(context.usedTraceParent).to.be.true;
    expect(context.longTraceId).to.equal(traceParentTraceId);
    const w3cTraceContext = context.w3cTraceContext;
    expect(w3cTraceContext).to.be.an('object');
    expect(w3cTraceContext.traceParentTraceId).to.equal(traceParentTraceId);
    expect(w3cTraceContext.traceParentParentId).to.equal(traceParentParentId);
    expect(w3cTraceContext.sampled).to.be.true;
    expect(w3cTraceContext.instanaTraceId).to.not.exist;
    expect(w3cTraceContext.instanaParentId).to.not.exist;
  });

  it('should capture IDs from tracestate "in" key-value pair if X-INSTANA- is missing', () => {
    const context = tracingHeaders.fromHttpRequest({
      headers: {
        traceparent: traceParent,
        tracestate: traceStateWithInstanaNarrow
      }
    });

    expect(context).to.be.an('object');
    expect(context.traceId).to.equal(traceParentTraceIdRightHalf);
    expect(context.parentId).to.equal(traceParentParentId);
    expect(context.usedTraceParent).to.be.true;
    expect(context.longTraceId).to.equal(traceParentTraceId);
    const w3cTraceContext = context.w3cTraceContext;
    expect(w3cTraceContext).to.be.an('object');
    expect(w3cTraceContext.traceParentTraceId).to.equal(traceParentTraceId);
    expect(w3cTraceContext.traceParentParentId).to.equal(traceParentParentId);
    expect(w3cTraceContext.sampled).to.be.true;
    expect(w3cTraceContext.instanaTraceId).to.equal(instana16CharTraceId);
    expect(w3cTraceContext.instanaParentId).to.equal(instanaSpanId);
  });

  it('should prefer X-INSTANA- over W3C traceparent and tracestate', () => {
    const context = tracingHeaders.fromHttpRequest({
      headers: {
        'x-instana-t': instana16CharTraceId,
        'x-instana-s': instanaSpanId,
        traceparent: traceParent,
        tracestate: traceStateWithInstanaNarrow
      }
    });

    expect(context).to.be.an('object');
    expect(context.traceId).to.equal(instana16CharTraceId);
    expect(context.parentId).to.equal(instanaSpanId);
    expect(context.usedTraceParent).to.be.false;
    expect(context.longTraceId).to.not.exist;
    const w3cTraceContext = context.w3cTraceContext;
    expect(w3cTraceContext).to.be.an('object');
    expect(w3cTraceContext.traceParentTraceId).to.equal(traceParentTraceId);
    expect(w3cTraceContext.traceParentParentId).to.equal(traceParentParentId);
    expect(w3cTraceContext.sampled).to.be.true;
    expect(w3cTraceContext.instanaTraceId).to.equal(instana16CharTraceId);
    expect(w3cTraceContext.instanaParentId).to.equal(instanaSpanId);
  });

  it('should prefer X-INSTANA- over W3C traceparent IDs and limit the length', () => {
    const context = tracingHeaders.fromHttpRequest({
      headers: {
        'x-instana-t': instana32CharTraceId,
        'x-instana-s': instanaSpanId,
        traceparent: traceParent
      }
    });

    expect(context).to.be.an('object');
    expect(context.traceId).to.equal(instana32CharTraceIdRightHalf);
    expect(context.parentId).to.equal(instanaSpanId);
    expect(context.usedTraceParent).to.be.false;
    expect(context.longTraceId).to.equal(instana32CharTraceId);
    const w3cTraceContext = context.w3cTraceContext;
    expect(w3cTraceContext).to.be.an('object');
    expect(w3cTraceContext.traceParentTraceId).to.equal(traceParentTraceId);
    expect(w3cTraceContext.traceParentParentId).to.equal(traceParentParentId);
    expect(w3cTraceContext.sampled).to.be.true;
    expect(w3cTraceContext.instanaTraceId).to.not.exist;
    expect(w3cTraceContext.instanaParentId).to.not.exist;
  });

  it('should prefer W3C traceparent over tracestate "in" key-value pair', () => {
    const context = tracingHeaders.fromHttpRequest({
      headers: {
        traceparent: traceParent,
        tracestate: traceStateWithInstanaNarrow
      }
    });

    expect(context).to.be.an('object');
    expect(context.traceId).to.equal(traceParentTraceIdRightHalf);
    expect(context.parentId).to.equal(traceParentParentId);
    expect(context.usedTraceParent).to.be.true;
    expect(context.longTraceId).to.equal(traceParentTraceId);
    const w3cTraceContext = context.w3cTraceContext;
    expect(w3cTraceContext).to.be.an('object');
    expect(w3cTraceContext.traceParentTraceId).to.equal(traceParentTraceId);
    expect(w3cTraceContext.traceParentParentId).to.equal(traceParentParentId);
    expect(w3cTraceContext.sampled).to.be.true;
    expect(w3cTraceContext.instanaTraceId).to.equal(instana16CharTraceId);
    expect(w3cTraceContext.instanaParentId).to.equal(instanaSpanId);
  });

  it('should read W3C trace context headers with an "in" key-value pair (wide)', () => {
    const context = tracingHeaders.fromHttpRequest({
      headers: {
        traceparent: traceParent,
        tracestate: traceStateWithInstanaWide
      }
    });

    expect(context).to.be.an('object');
    expect(context.traceId).to.equal(traceParentTraceIdRightHalf);
    expect(context.parentId).to.equal(traceParentParentId);
    expect(context.usedTraceParent).to.be.true;
    expect(context.longTraceId).to.equal(traceParentTraceId);
    const w3cTraceContext = context.w3cTraceContext;
    expect(w3cTraceContext).to.be.an('object');
    expect(w3cTraceContext.traceParentTraceId).to.equal(traceParentTraceId);
    expect(w3cTraceContext.traceParentParentId).to.equal(traceParentParentId);
    expect(w3cTraceContext.sampled).to.be.true;
    expect(w3cTraceContext.instanaTraceId).to.equal(instana32CharTraceId);
    expect(w3cTraceContext.instanaParentId).to.equal(instanaSpanId);
  });

  it('should read W3C trace context headers with an "in" key-value pair (narrow)', () => {
    const context = tracingHeaders.fromHttpRequest({
      headers: {
        traceparent: traceParent,
        tracestate: traceStateWithInstanaNarrow
      }
    });

    expect(context).to.be.an('object');
    expect(context.traceId).to.equal(traceParentTraceIdRightHalf);
    expect(context.parentId).to.equal(traceParentParentId);
    expect(context.usedTraceParent).to.be.true;
    expect(context.longTraceId).to.equal(traceParentTraceId);
    const w3cTraceContext = context.w3cTraceContext;
    expect(w3cTraceContext).to.be.an('object');
    expect(w3cTraceContext.traceParentTraceId).to.equal(traceParentTraceId);
    expect(w3cTraceContext.traceParentParentId).to.equal(traceParentParentId);
    expect(w3cTraceContext.sampled).to.be.true;
    expect(w3cTraceContext.instanaTraceId).to.equal(instana16CharTraceId);
    expect(w3cTraceContext.instanaParentId).to.equal(instanaSpanId);
  });

  it('should start a new trace if neither X-INSTANA- nor W3C trace context headers are present', () => {
    const context = tracingHeaders.fromHttpRequest({
      headers: {}
    });

    expect(context).to.be.an('object');
    expect(context.traceId).to.be.a('string');
    expect(context.traceId).to.have.lengthOf(16);
    expect(context.parentId).to.not.exist;
    expect(context.usedTraceParent).to.be.false;
    expect(context.longTraceId).to.not.exist;
    const w3cTraceContext = context.w3cTraceContext;
    expect(w3cTraceContext).to.be.an('object');
    expect(w3cTraceContext.traceParentTraceId).to.equal(`0000000000000000${context.traceId}`);
    expect(w3cTraceContext.traceParentParentId).to.equal('0000000000000000');
    expect(w3cTraceContext.sampled).to.be.true;
    expect(w3cTraceContext.instanaTraceId).to.equal(context.traceId);
    expect(w3cTraceContext.instanaParentId).to.equal('0000000000000000');
  });

  it('should cope with missing headers', () => {
    const context = tracingHeaders.fromHttpRequest({});

    expect(context).to.be.an('object');
    expect(context.traceId).to.be.a('string');
    expect(context.traceId).to.have.lengthOf(16);
    expect(context.parentId).to.not.exist;
    expect(context.usedTraceParent).to.be.false;
    expect(context.longTraceId).to.not.exist;
    const w3cTraceContext = context.w3cTraceContext;
    expect(w3cTraceContext).to.be.an('object');
    expect(w3cTraceContext.traceParentTraceId).to.equal(`0000000000000000${context.traceId}`);
    expect(w3cTraceContext.traceParentParentId).to.equal('0000000000000000');
    expect(w3cTraceContext.sampled).to.be.true;
    expect(w3cTraceContext.instanaTraceId).to.equal(context.traceId);
    expect(w3cTraceContext.instanaParentId).to.equal('0000000000000000');
  });

  it('should cope with null', () => {
    const context = tracingHeaders.fromHttpRequest();

    expect(context).to.be.an('object');
    expect(context.traceId).to.be.a('string');
    expect(context.traceId).to.have.lengthOf(16);
    expect(context.parentId).to.not.exist;
    expect(context.usedTraceParent).to.be.false;
    expect(context.longTraceId).to.not.exist;
    const w3cTraceContext = context.w3cTraceContext;
    expect(w3cTraceContext).to.be.an('object');
    expect(w3cTraceContext.traceParentTraceId).to.equal(`0000000000000000${context.traceId}`);
    expect(w3cTraceContext.traceParentParentId).to.equal('0000000000000000');
    expect(w3cTraceContext.sampled).to.be.true;
    expect(w3cTraceContext.instanaTraceId).to.equal(context.traceId);
    expect(w3cTraceContext.instanaParentId).to.equal('0000000000000000');
  });

  [true, false].forEach(withInstanaHeaders =>
    [false, '1', '0'].forEach(withInstanaLevel =>
      [
        false,
        'traceparent-only',
        'tracestate-without-in',
        'tracestate-in-left-most',
        'tracestate-in-not-leftmost'
      ].forEach(withSpecHeaders => registerTest(withInstanaHeaders, withInstanaLevel, withSpecHeaders))
    )
  );

  function registerTest(withInstanaHeaders, withInstanaLevel, withSpecHeaders) {
    const title =
      //
      `X-INSTANA-T/-S: ${withInstanaHeaders}, X-INSTANA-L: ${withInstanaLevel}, spec headers: ${withSpecHeaders}`;
    const headers = {};

    if (withInstanaHeaders) {
      headers['x-instana-t'] = instana16CharTraceId;
      headers['x-instana-s'] = instanaSpanId;
    }
    if (withSpecHeaders !== false) {
      headers.traceparent = traceParent;
      if (withSpecHeaders === 'traceparent-only') {
        // nothing to do
      } else if (withSpecHeaders === 'tracestate-without-in') {
        headers.tracestate = traceStateWithoutInstana;
      } else if (withSpecHeaders === 'tracestate-in-left-most') {
        headers.tracestate = traceStateWithInstanaLeftMostNarrow;
      } else if (withSpecHeaders === 'tracestate-in-not-leftmost') {
        headers.tracestate = traceStateWithInstanaNarrow;
      } else {
        throw new Error(`Unknown withSpecHeaders value: ${withSpecHeaders}`);
      }
    }

    if (withInstanaLevel !== false) {
      headers['x-instana-l'] = withInstanaLevel;
    }

    it(title, () => {
      const context = tracingHeaders.fromHttpRequest({ headers });
      expect(context).to.be.an('object');
      const w3cTraceContext = context.w3cTraceContext;
      expect(w3cTraceContext).to.be.an('object');

      if (withInstanaLevel === '0') {
        // We expect no trace to be started and no IDs to be generated.
        expect(context.traceId).to.not.exist;
        expect(context.parentId).to.not.exist;
        expect(context.instanaAncestor).to.not.exist;
        expect(context.usedTraceParent).to.be.false;
        expect(context.longTraceId).to.not.exist;
      } else if (withInstanaHeaders) {
        // We expect the Instana headers to be respected.
        expect(context.traceId).to.equal(instana16CharTraceId);
        expect(context.parentId).to.equal(instanaSpanId);
        expect(context.instanaAncestor).to.not.exist;
        expect(context.usedTraceParent).to.be.false;
        expect(context.longTraceId).to.not.exist;
      } else if (withSpecHeaders === false) {
        // Neither the X-INSTANA- headers, nor traceparent/tracestate yielded a trace ID/parent ID. We expect a trace to
        // be started with a new, generated trace ID.
        expect(context.traceId).to.be.a('string');
        expect(context.traceId).to.have.lengthOf(16);
        expect(context.traceId).to.not.equal(instana16CharTraceId);
        expect(context.parentId).to.not.exist;
        expect(context.instanaAncestor).to.not.exist;
        expect(context.usedTraceParent).to.be.false;
        expect(context.longTraceId).to.not.exist;
      } else if (withSpecHeaders === 'traceparent-only' || withSpecHeaders === 'tracestate-without-in') {
        // X-INSTANA- headers did not provide IDs, and neither was there an `in` key-value pair in tracestate. But
        // there was a traceparent header and we expect the IDs from that header to be used.
        expect(context.traceId).to.equal(traceParentTraceIdRightHalf);
        expect(context.parentId).to.equal(traceParentParentId);
        expect(context.instanaAncestor).to.not.exist;
        expect(context.usedTraceParent).to.be.true;
        expect(context.longTraceId).to.equal(traceParentTraceId);
      } else if (withSpecHeaders === 'tracestate-in-left-most' || withSpecHeaders === 'tracestate-in-not-leftmost') {
        expect(context.instanaAncestor).to.be.an('object');
        expect(context.instanaAncestor.t).to.equal(instana16CharTraceId);
        expect(context.instanaAncestor.p).to.equal(instanaSpanId);
        expect(context.usedTraceParent).to.be.true;
        expect(context.longTraceId).to.equal(traceParentTraceId);
      } else {
        fail('This should never happen, all cases should have been covered above.');
      }

      if (withSpecHeaders) {
        expect(w3cTraceContext.traceParentTraceId).to.equal(traceParentTraceId);
        expect(w3cTraceContext.traceParentParentId).to.equal(traceParentParentId);
      } else if (withInstanaHeaders && withInstanaLevel !== '0') {
        expect(w3cTraceContext.traceParentTraceId).to.equal(`0000000000000000${instana16CharTraceId}`);
        expect(w3cTraceContext.traceParentParentId).to.equal(instanaSpanId);
      } else {
        // No foreign trace/parent ID available, new IDs will be generated.
        expect(w3cTraceContext.traceParentTraceId).to.be.a('string');
        expect(w3cTraceContext.traceParentTraceId).to.have.lengthOf(32);
        expect(w3cTraceContext.traceParentTraceId).to.not.equal(instana16CharTraceId);
        expect(w3cTraceContext.traceParentTraceId).to.not.equal(traceParentTraceId);
        expect(w3cTraceContext.traceParentParentId).to.be.a('string');
        expect(w3cTraceContext.traceParentParentId).to.have.lengthOf(16);
        expect(w3cTraceContext.traceParentParentId).to.not.equal(instanaSpanId);
        expect(w3cTraceContext.traceParentParentId).to.not.equal(traceParentParentId);
      }

      if (!withSpecHeaders && withInstanaLevel === '0') {
        expect(w3cTraceContext.sampled).to.be.false;
      } else {
        expect(w3cTraceContext.sampled).to.be.true;
      }

      if (
        withInstanaHeaders &&
        withInstanaLevel !== '0' &&
        withSpecHeaders !== 'tracestate-without-in' &&
        withSpecHeaders !== 'traceparent-only'
      ) {
        expect(w3cTraceContext.instanaTraceId).to.equal(instana16CharTraceId);
        expect(w3cTraceContext.instanaParentId).to.equal(instanaSpanId);
      } else if (withSpecHeaders === 'tracestate-in-left-most' || withSpecHeaders === 'tracestate-in-not-leftmost') {
        expect(w3cTraceContext.instanaTraceId).to.equal(instana16CharTraceId);
        expect(w3cTraceContext.instanaParentId).to.equal(instanaSpanId);
      } else if (withInstanaLevel !== '0' && !withInstanaHeaders && !withSpecHeaders) {
        expect(w3cTraceContext.instanaTraceId).to.equal(context.traceId);
        expect(w3cTraceContext.instanaParentId).to.equal('0000000000000000');
      } else {
        expect(w3cTraceContext.instanaTraceId).to.not.exist;
        expect(w3cTraceContext.instanaParentId).to.not.exist;
      }
    });
  }
});
