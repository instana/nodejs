'use strict';

const { expect } = require('chai');
const { fail } = expect;

const tracingHeaders = require('../../src/tracing/tracingHeaders');

// X-INSTANA- values
const instana32CharTraceId = '0123456789abcdeffedcbc9876543210';
const instana16CharTraceId = '0123456789abcdef';
const instanaSpanId = '02468acefdb97531';

// W3C trace context values
const version00 = '00';
const foreignTraceId = '0af7651916cd43dd8448eb211c80319c';
const foreignParentId = 'b7ad6b7169203331';
const flags = '01';
const traceParent = `${version00}-${foreignTraceId}-${foreignParentId}-${flags}`;
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
        'x-instana-t': instana32CharTraceId,
        'x-instana-s': instanaSpanId
      }
    });

    expect(context).to.be.an('object');
    expect(context.traceId).to.equal(instana32CharTraceId);
    expect(context.parentId).to.equal(instanaSpanId);
  });

  it('should use X-INSTANA- headers to create a new W3C trace context', () => {
    const context = tracingHeaders.fromHttpRequest({
      headers: {
        'x-instana-t': instana32CharTraceId,
        'x-instana-s': instanaSpanId
      }
    });
    const w3cTraceContext = context.w3cTraceContext;
    expect(w3cTraceContext).to.be.an('object');
    expect(w3cTraceContext.foreignTraceId).to.equal(instana32CharTraceId);
    expect(w3cTraceContext.foreignParentId).to.equal(instanaSpanId);
    expect(w3cTraceContext.sampled).to.be.true;
    expect(w3cTraceContext.instanaTraceId).to.equal(instana32CharTraceId);
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

    it('should discard correlation info is not sampling', () => {
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

  it('should read W3C trace context headers without an in key-value pair', () => {
    const context = tracingHeaders.fromHttpRequest({
      headers: {
        traceparent: traceParent,
        tracestate: traceStateWithoutInstana
      }
    });

    expect(context).to.be.an('object');
    expect(context.traceId).to.be.a('string');
    expect(context.traceId).to.have.lengthOf(16);
    expect(context.parentId).to.not.exist;
    const w3cTraceContext = context.w3cTraceContext;
    expect(w3cTraceContext).to.be.an('object');
    expect(w3cTraceContext.foreignTraceId).to.equal(foreignTraceId);
    expect(context.traceId).to.not.equal(w3cTraceContext.foreignTraceId);
    expect(w3cTraceContext.foreignParentId).to.equal(foreignParentId);
    expect(w3cTraceContext.sampled).to.be.true;
    expect(w3cTraceContext.instanaTraceId).to.not.exist;
    expect(w3cTraceContext.instanaParentId).to.not.exist;
  });

  it('should read W3C trace context headers with an in key-value pair (wide)', () => {
    const context = tracingHeaders.fromHttpRequest({
      headers: {
        traceparent: traceParent,
        tracestate: traceStateWithInstanaWide
      }
    });

    expect(context).to.be.an('object');
    expect(context.traceId).to.equal(instana32CharTraceId);
    expect(context.parentId).to.equal(instanaSpanId);
    const w3cTraceContext = context.w3cTraceContext;
    expect(w3cTraceContext).to.be.an('object');
    expect(w3cTraceContext.foreignTraceId).to.equal(foreignTraceId);
    expect(w3cTraceContext.foreignParentId).to.equal(foreignParentId);
    expect(w3cTraceContext.sampled).to.be.true;
    expect(w3cTraceContext.instanaTraceId).to.equal(instana32CharTraceId);
    expect(w3cTraceContext.instanaParentId).to.equal(instanaSpanId);
  });

  it('should read W3C trace context headers with an in key-value pair (narrow)', () => {
    const context = tracingHeaders.fromHttpRequest({
      headers: {
        traceparent: traceParent,
        tracestate: traceStateWithInstanaNarrow
      }
    });

    expect(context).to.be.an('object');
    expect(context.traceId).to.equal(instana16CharTraceId);
    expect(context.parentId).to.equal(instanaSpanId);
    const w3cTraceContext = context.w3cTraceContext;
    expect(w3cTraceContext).to.be.an('object');
    expect(w3cTraceContext.foreignTraceId).to.equal(foreignTraceId);
    expect(w3cTraceContext.foreignParentId).to.equal(foreignParentId);
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
    const w3cTraceContext = context.w3cTraceContext;
    expect(w3cTraceContext).to.be.an('object');
    expect(w3cTraceContext.foreignTraceId).to.equal(`0000000000000000${context.traceId}`);
    expect(w3cTraceContext.foreignParentId).to.equal('0000000000000000');
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
    const w3cTraceContext = context.w3cTraceContext;
    expect(w3cTraceContext).to.be.an('object');
    expect(w3cTraceContext.foreignTraceId).to.equal(`0000000000000000${context.traceId}`);
    expect(w3cTraceContext.foreignParentId).to.equal('0000000000000000');
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
    const w3cTraceContext = context.w3cTraceContext;
    expect(w3cTraceContext).to.be.an('object');
    expect(w3cTraceContext.foreignTraceId).to.equal(`0000000000000000${context.traceId}`);
    expect(w3cTraceContext.foreignParentId).to.equal('0000000000000000');
    expect(w3cTraceContext.sampled).to.be.true;
    expect(w3cTraceContext.instanaTraceId).to.equal(context.traceId);
    expect(w3cTraceContext.instanaParentId).to.equal('0000000000000000');
  });

  [true, false].forEach(withInstanaHeaders =>
    [false, '1', '0'].forEach(withInstanaLevel =>
      [false, 'without-in', 'in-leftmost', 'in-not-leftmost'].forEach(withSpecHeaders =>
        registerTest(withInstanaHeaders, withInstanaLevel, withSpecHeaders)
      )
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
      if (withSpecHeaders === 'without-in') {
        headers.tracestate = traceStateWithoutInstana;
      } else if (withSpecHeaders === 'in-leftmost') {
        headers.tracestate = traceStateWithInstanaLeftMostNarrow;
      } else if (withSpecHeaders === 'in-not-leftmost') {
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
      } else if (withInstanaHeaders) {
        // We expect the Instana headers to be respected.
        expect(context.traceId).to.equal(instana16CharTraceId);
        expect(context.parentId).to.equal(instanaSpanId);
      } else if (withSpecHeaders === false || withSpecHeaders === 'without-in') {
        // Neither the X-INSTANA- headers nor tracestate yielded a trace ID/parent ID. We expect a trace to be started
        // with a new, generated trace ID.
        expect(context.traceId).to.be.a('string');
        expect(context.traceId).to.have.lengthOf(16);
        expect(context.traceId).to.not.equal(instana16CharTraceId);
        expect(context.parentId).to.not.exist;
      } else if (withSpecHeaders === 'in-leftmost' || withSpecHeaders === 'in-not-leftmost') {
        expect(context.traceId).to.equal(instana16CharTraceId);
        expect(context.parentId).to.equal(instanaSpanId);
      } else {
        fail('This should never happen, all cases should have been covered above.');
      }

      if (withSpecHeaders) {
        expect(w3cTraceContext.foreignTraceId).to.equal(foreignTraceId);
        expect(w3cTraceContext.foreignParentId).to.equal(foreignParentId);
      } else if (withInstanaHeaders && withInstanaLevel !== '0') {
        expect(w3cTraceContext.foreignTraceId).to.equal(`0000000000000000${instana16CharTraceId}`);
        expect(w3cTraceContext.foreignParentId).to.equal(instanaSpanId);
      } else {
        // No foreign trace/parent ID available, new IDs will be generated.
        expect(w3cTraceContext.foreignTraceId).to.be.a('string');
        expect(w3cTraceContext.foreignTraceId).to.have.lengthOf(32);
        expect(w3cTraceContext.foreignTraceId).to.not.equal(instana16CharTraceId);
        expect(w3cTraceContext.foreignTraceId).to.not.equal(foreignTraceId);
        expect(w3cTraceContext.foreignParentId).to.be.a('string');
        expect(w3cTraceContext.foreignParentId).to.have.lengthOf(16);
        expect(w3cTraceContext.foreignParentId).to.not.equal(instanaSpanId);
        expect(w3cTraceContext.foreignParentId).to.not.equal(foreignParentId);
      }

      if (!withSpecHeaders && withInstanaLevel === '0') {
        expect(w3cTraceContext.sampled).to.be.false;
      } else {
        expect(w3cTraceContext.sampled).to.be.true;
      }

      if (withInstanaHeaders && withInstanaLevel !== '0' && withSpecHeaders !== 'without-in') {
        expect(w3cTraceContext.instanaTraceId).to.equal(instana16CharTraceId);
        expect(w3cTraceContext.instanaParentId).to.equal(instanaSpanId);
      } else if (withSpecHeaders === 'in-leftmost' || withSpecHeaders === 'in-not-leftmost') {
        expect(w3cTraceContext.instanaTraceId).to.equal(instana16CharTraceId);
        expect(w3cTraceContext.instanaParentId).to.equal(instanaSpanId);
      } else if (withInstanaLevel !== '0' && !withInstanaHeaders && !withSpecHeaders) {
        expect(w3cTraceContext.instanaTraceId).to.equal(context.traceId);
        expect(w3cTraceContext.instanaParentId).to.equal('0000000000000000');
      } else {
        expect(w3cTraceContext.instanaTraceId).to.not.exist;
        expect(w3cTraceContext.instanaParentId).to.not.exist;
      }

      if ((!withInstanaHeaders && withSpecHeaders) || withSpecHeaders === 'in-not-leftmost') {
        expect(context.foreignParent).to.exist;
        expect(context.foreignParent.t).to.equal(foreignTraceId);
        expect(context.foreignParent.p).to.equal(foreignParentId);
        expect(context.foreignParent.lts).to.equal('rojo=00f067aa0ba902b7');
      } else if (withInstanaLevel !== '0') {
        expect(context.foreignParent).to.not.exist;
      }
    });
  }
});
