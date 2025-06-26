/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const spanBuffer = require('../../src/tracing/spanBuffer');
const delay = require('../test_util/delay');
const testUtils = require('../test_util');
const { generateRandomSpanId, generateRandomTraceId } = require('../../src/tracing/tracingUtil');

describe.only('tracing/spanBuffer', () => {
  const start = 18000; // arbitrary reference timestamp

  const traceId1 = generateRandomTraceId();
  const traceId2 = generateRandomTraceId();
  const parentId1 = generateRandomSpanId();
  const parentId2 = generateRandomSpanId();
  let downstreamConnectionStub;

  describe('isFaaS: true', () => {
    before(() => {
      sinon.spy(global, 'setTimeout');

      downstreamConnectionStub = {
        sendSpans: sinon.stub()
      };

      spanBuffer.init(
        {
          logger: testUtils.createFakeLogger(),
          tracing: {
            maxBufferedSpans: 1000,
            forceTransmissionStartingAt: 500,
            transmissionDelay: 1000
          }
        },
        downstreamConnectionStub
      );

      spanBuffer.setIsFaaS(true);
      spanBuffer.addBatchableSpanName('batchable');
    });

    beforeEach(() => {
      spanBuffer.activate();
      expect(global.setTimeout.called).to.be.false;

      global.setTimeout.resetHistory();
    });

    afterEach(() => {
      spanBuffer.deactivate();
    });

    after(() => {
      sinon.restore();
    });

    it('should add span and send not immediately', () => {
      const span = {
        n: 'some-span-name',
        t: traceId1,
        p: parentId1,
        s: '1',
        ts: timestamp(Date.now()),
        d: 47,
        ec: 0
      };
      spanBuffer.addSpan(span);

      const spans = spanBuffer.getAndResetSpans();
      expect(spans).to.have.lengthOf(1);
      expect(downstreamConnectionStub.sendSpans.called).to.be.false;
      expect(global.setTimeout.called).to.be.false;
    });

    it('should add span and send immediately', () => {
      spanBuffer.setTransmitImmediate(true);

      const span = {
        n: 'some-span-name',
        t: traceId1,
        p: parentId1,
        s: '1',
        ts: timestamp(Date.now()),
        d: 47,
        ec: 0
      };
      spanBuffer.addSpan(span);

      const spans = spanBuffer.getAndResetSpans();
      expect(spans).to.have.lengthOf(0);
      expect(downstreamConnectionStub.sendSpans.called).to.be.true;
      expect(global.setTimeout.called).to.be.false;
    });
  });

  describe('isFaaS: false', () => {
    before(() => {
      sinon.spy(global, 'setTimeout');

      downstreamConnectionStub = {
        sendSpans: sinon.stub()
      };

      spanBuffer.init(
        {
          logger: testUtils.createFakeLogger(),
          tracing: {
            maxBufferedSpans: 1000,
            forceTransmissionStartingAt: 2,
            initialTransmissionDelay: 200,
            transmissionDelay: 200
          }
        },
        downstreamConnectionStub
      );

      spanBuffer.addBatchableSpanName('batchable');
    });

    beforeEach(() => {
      spanBuffer.activate();
      expect(global.setTimeout.called).to.be.true;
      global.setTimeout.resetHistory();
    });

    afterEach(() => {
      spanBuffer.deactivate();
    });

    after(() => {
      sinon.restore();
    });

    describe('adding spans', () => {
      it('should add span and not send immediately', () => {
        const span = {
          n: 'some-span-name',
          t: traceId1,
          p: parentId1,
          s: '1',
          ts: timestamp(Date.now()),
          d: 47,
          ec: 0
        };
        spanBuffer.addSpan(span);

        const spans = spanBuffer.getAndResetSpans();
        expect(spans).to.have.lengthOf(1);
        expect(spans[0]).to.equal(span);

        expect(downstreamConnectionStub.sendSpans.called).to.be.false;
        expect(global.setTimeout.called).to.be.false;
      });

      it('should add span and send immediately', async () => {
        // NOTE: wait for the initial timeout to occur, otherwise it will send out our spans to test
        await delay(1100);
        downstreamConnectionStub.sendSpans.resetHistory();

        const span1 = {
          n: 'some-span-name-1',
          t: traceId1,
          p: parentId1,
          s: '1',
          ts: timestamp(Date.now()),
          d: 47,
          ec: 0
        };
        const span2 = {
          n: 'some-span-name-2',
          t: traceId1,
          p: parentId1,
          s: '1',
          ts: timestamp(Date.now()),
          d: 47,
          ec: 0
        };

        spanBuffer.addSpan(span1);
        expect(spanBuffer.isEmpty()).to.be.false;

        spanBuffer.addSpan(span2);
        expect(spanBuffer.isEmpty()).to.be.true;

        expect(downstreamConnectionStub.sendSpans.called).to.be.true;
        expect(global.setTimeout.called).to.be.true;
      });
    });

    describe('batching', () => {
      // Batching is opt-in for now, thus we need to explicitly enable it. The before-hook calling spanBuffer.init and
      // the beforeEach/afterEach calling activate/deactivate can be removed here when it becomes opt-out. (There is
      // an init call in the before-hook for the whole spanBuffer suite.)

      before(() => {
        spanBuffer.init(
          {
            logger: testUtils.createFakeLogger(),
            tracing: {
              maxBufferedSpans: 1000,
              forceTransmissionStartingAt: 500,
              transmissionDelay: 1000,
              spanBatchingEnabled: true
            }
          },
          {
            /* downstreamConnection */
            sendSpans: function () {}
          }
        );
        spanBuffer.addBatchableSpanName('batchable');
      });

      beforeEach(() => spanBuffer.activate());

      afterEach(() => spanBuffer.deactivate());

      describe('batching enabled', () => {
        it('should not merge a new span with duration 10 ms or longer', () => {
          const [span1, span2] = createSpans(7, 5, 10);
          verifyNoBatching(span1, span2);
        });

        it('should not merge a new a root span', () => {
          const [span1, span2] = createSpans(7, 5, 6);
          delete span2.p;
          verifyNoBatching(span1, span2);
        });

        it('should not merge a new unbatchable span', () => {
          const [span1, span2] = createSpans(7, 5, 6);
          span2.n = 'not-batchable'; // not in span buffers list of batcheable span types
          verifyNoBatching(span1, span2);
        });

        it('should not merge with an existing span with duration 10 ms or longer', () => {
          const [span1, span2] = createSpans(10, 5, 6);
          verifyNoBatching(span1, span2);
        });

        it('should not merge spans from different traces', () => {
          const [span1, span2] = createSpans(7, 5, 6);
          span2.t = traceId2;
          verifyNoBatching(span1, span2);
        });

        it('should not merge spans from with different parents', () => {
          const [span1, span2] = createSpans(7, 5, 6);
          span2.p = parentId2;
          verifyNoBatching(span1, span2);
        });

        it('should not merge with an existing span of a of different type', () => {
          const [span1, span2] = createSpans(7, 5, 6);
          span2.t = 'other';
          verifyNoBatching(span1, span2);
        });

        it('should not merge when the gap is 10 ms or longer', () => {
          const [span1, span2] = createSpans(7, 10, 6);
          verifyNoBatching(span1, span2);
        });

        it('should not merge when the gap is 10 ms or longer (chronologically later span comes in first)', () => {
          const [span1, span2] = createSpans(7, 10, 6);
          verifyNoBatching(span2, span1);
        });

        it('should merge two spans', () => {
          const [span1, span2] = createSpans(7, 5, 6);

          const batched = verifyBatching(span1, span2);

          expect(batched).to.equal(span1);
          expect(batched.s).to.equal('1');
          expect(batched.ts).to.equal(timestamp(0));
          expect(batched.d).to.equal(18);
          expect(batched.b.s).to.equal(2);
          expect(batched.b.d).to.equal(13);
        });

        it('should merge two spans with max distance and all possible  offsets to bucket borders', () => {
          const bucketWidth = 18;
          for (let offset = 0; offset <= bucketWidth + 1; offset++) {
            const [span1, span2] = createSpans(9, 9, 9, offset);
            const batched = verifyBatching(span1, span2);
            expect(batched).to.equal(span1);
            expect(batched.s).to.equal('1');
            expect(batched.ts).to.equal(timestamp(offset));
            expect(batched.d).to.equal(27);
            expect(batched.b.s).to.equal(2);
            expect(batched.b.d).to.equal(18);
          }
        });

        it('should merge multiple consecutive spans', () => {
          const span1 = createSpan(0, 7, '1'); // 1000-1007
          const span2 = createSpan(14, 8, '2'); // 1014-1022
          const span3 = createSpan(31, 3, '3'); // 1031-1034
          const span4 = createSpan(40, 5, '4'); // 1040-1045

          spanBuffer.addSpan(span1);
          spanBuffer.addSpan(span2);
          spanBuffer.addSpan(span3);
          spanBuffer.addSpan(span4);

          const spans = spanBuffer.getAndResetSpans();
          expect(spans).to.have.lengthOf(1);
          const batched = spans[0];

          expect(batched).to.equal(span2);
          expect(batched.s).to.equal('2');
          expect(batched.ts).to.equal(timestamp(0));
          expect(batched.d).to.equal(45);
          expect(batched.b.s).to.equal(4);
          expect(batched.b.d).to.equal(23);
        });

        it('span with ec != 0 should be more significant', () => {
          let span1;
          let span2;
          let batched;

          [span1, span2] = createSpans(7, 5, 6);
          span1.ec = 1;
          batched = verifyBatching(span1, span2);
          expect(batched).to.equal(span1);
          expect(batched.s).to.equal('1');
          expect(batched.ec).to.equal(1);

          [span1, span2] = createSpans(7, 5, 6);
          span2.ec = 1;
          batched = verifyBatching(span1, span2);
          expect(batched).to.equal(span2);
          expect(batched.s).to.equal('2');
          expect(batched.ec).to.equal(1);

          // error count has higher priority than duration
          [span1, span2] = createSpans(3, 5, 4);
          span1.ec = 1;
          batched = verifyBatching(span1, span2);
          expect(batched).to.equal(span1);
          expect(batched.s).to.equal('1');
          expect(batched.ec).to.equal(1);
        });

        it('longer span should be more significant', () => {
          let span1;
          let span2;
          let batched;

          [span1, span2] = createSpans(7, 5, 6);
          batched = verifyBatching(span1, span2);
          expect(batched).to.equal(span1);
          expect(batched.s).to.equal('1');
          expect(batched.d).to.equal(18);
          expect(batched.b.d).to.equal(13);

          [span1, span2] = createSpans(6, 5, 7);
          batched = verifyBatching(span1, span2);
          expect(batched).to.equal(span2);
          expect(batched.s).to.equal('2');
          expect(batched.d).to.equal(18);
          expect(batched.b.d).to.equal(13);
        });

        it('span starting earlier should be more significant (chronologically later span comes in first)', () => {
          const [span1, span2] = createSpans(5, 7, 5);

          spanBuffer.addSpan(span2);
          spanBuffer.addSpan(span1); // adding span1 later than span2

          // Note: The algorithm we use is optimized by only guaranteeing that spans that can be batched are batched if
          // the arrive in the correct order in the span buffer. So in general the case where the span that starts
          // earlier is not guaranteed to be batched. This particular case works because both spans land in the
          // same bucket.

          // Even though span1 arrived later, both spans should still merge into span1, because that started earlier
          // according to span1.ts
          const batched = expectBatching();
          expect(batched).to.equal(span1);
          expect(batched.s).to.equal('1');
          expect(batched.ts).to.equal(timestamp(0));
          expect(batched.d).to.equal(17);
          expect(batched.b.s).to.equal(2);
          expect(batched.b.d).to.equal(10);
        });

        it('should determine batch duration', () => {
          let span1;
          let span2;
          let batched;

          // target span is a batched span itself
          [span1, span2] = createSpans(7, 5, 6);
          span1.b = { d: 22 };
          batched = verifyBatching(span1, span2);
          expect(batched.b.d).to.equal(28); // 22 + 6

          // source span is a batched span itself
          [span1, span2] = createSpans(7, 5, 6);
          span2.b = { d: 22 };
          batched = verifyBatching(span1, span2);
          expect(batched.b.d).to.equal(29); // 22 + 7

          // both spans are a batched span
          [span1, span2] = createSpans(7, 5, 6);
          span1.b = { d: 27 };
          span2.b = { d: 28 };
          batched = verifyBatching(span1, span2);
          expect(batched.b.d).to.equal(55);
        });

        it('should determine timestamp and span duration', () => {
          let span1;
          let span2;
          let batched;

          // cases
          // ------------------------------------------> time
          //
          // gap between spans, target span started earlier
          // | target |           | source |
          //          |----gap----|
          [span1, span2] = createSpans(8, 3, 4);
          span1.ec = 1; // throughout this test we use span.ec to control which span becomes the target span
          batched = verifyBatching(span1, span2);
          expect(batched.ts).to.equal(timestamp(0));
          expect(batched.d).to.equal(15);
          // gap between spans, source span started earlier
          // | source |           | target |
          //          |----gap----|
          [span1, span2] = createSpans(8, 3, 4);
          span2.ec = 1;
          batched = verifyBatching(span1, span2);
          expect(batched.ts).to.equal(timestamp(0));
          expect(batched.d).to.equal(15);

          // no gap between spans, target span started earlier
          // | target | source |
          [span1, span2] = createSpans(8, 0, 4);
          span1.ec = 1;
          batched = verifyBatching(span1, span2);
          expect(batched.ts).to.equal(timestamp(0));
          expect(batched.d).to.equal(12);
          // no gap between spans, source span started earlier
          // | source | target |
          [span1, span2] = createSpans(8, 0, 4);
          span2.ec = 1;
          batched = verifyBatching(span1, span2);
          expect(batched.ts).to.equal(timestamp(0));
          expect(batched.d).to.equal(12);

          // overlapping spans, target span started earlier
          // | target |
          //     | source |
          [span1, span2] = createSpans(8, -3, 7);
          span1.ec = 1;
          batched = verifyBatching(span1, span2);
          expect(batched.ts).to.equal(timestamp(0));
          expect(batched.d).to.equal(12);
          // overlapping spans, source span started earlier
          // | source |
          //     | target |
          [span1, span2] = createSpans(8, -3, 7);
          span2.ec = 1;
          batched = verifyBatching(span1, span2);
          expect(batched.ts).to.equal(timestamp(0));
          expect(batched.d).to.equal(12);

          // one spans "contains" the other
          // |     target      |
          //     | source |
          [span1, span2] = createSpans(9, 0, 4);
          span2.ts = timestamp(2);
          span1.ec = 1;
          batched = verifyBatching(span1, span2);
          expect(batched.ts).to.equal(timestamp(0));
          expect(batched.d).to.equal(9);
          // |     source      |
          //     | target |
          [span1, span2] = createSpans(9, 0, 4);
          span2.ts = timestamp(2);
          span2.ec = 1;
          batched = verifyBatching(span1, span2);
          expect(batched.ts).to.equal(timestamp(0));
          expect(batched.d).to.equal(9);
        });

        it('should determine error count', () => {
          let span1;
          let span2;
          let batched;

          [span1, span2] = createSpans(7, 5, 6);
          span1.ec = 3;
          batched = verifyBatching(span1, span2);
          expect(batched.ec).to.equal(3);

          [span1, span2] = createSpans(7, 5, 6);
          span2.ec = 4;
          batched = verifyBatching(span1, span2);
          expect(batched.ec).to.equal(4);

          [span1, span2] = createSpans(7, 5, 6);
          span1.ec = 3;
          span2.ec = 4;
          batched = verifyBatching(span1, span2);
          expect(batched.ec).to.equal(7);
        });

        it('should determine batch size', () => {
          let span1;
          let span2;
          let batched;

          // target span is a batched span itself
          [span1, span2] = createSpans(7, 5, 6);
          span1.b = { s: 7 };
          batched = verifyBatching(span1, span2);
          expect(batched.b.s).to.equal(8);

          // source span is a batched span itself
          [span1, span2] = createSpans(7, 5, 6);
          span2.b = { s: 7 };
          batched = verifyBatching(span1, span2);
          expect(batched.b.s).to.equal(8);

          // both spans are a batched span
          [span1, span2] = createSpans(7, 5, 6);
          span1.b = { s: 7 };
          span2.b = { s: 8 };
          batched = verifyBatching(span1, span2);
          expect(batched.b.s).to.equal(15);
        });
      });
    });

    describe('batching disabled', () => {
      before(() => {
        spanBuffer.init(
          {
            logger: testUtils.createFakeLogger(),
            tracing: {
              maxBufferedSpans: 1000,
              forceTransmissionStartingAt: 500,
              transmissionDelay: 1000,
              spanBatchingEnabled: false
            }
          },
          {
            /* downstreamConnection */
            sendSpans: function () {}
          }
        );

        spanBuffer.addBatchableSpanName('batchable');
      });

      beforeEach(() => spanBuffer.activate());

      afterEach(() => spanBuffer.deactivate());

      it('should not merge two spans even if they are batchable', () => {
        const [span1, span2] = createSpans(7, 5, 6);
        verifyNoBatching(span1, span2);
      });
    });

    describe('when applying span transformations', () => {
      beforeEach(() => spanBuffer.activate());

      afterEach(() => spanBuffer.deactivate());
      const span = {
        t: '1234567803',
        s: '1234567892',
        p: '1234567891',
        n: 'redis',
        k: 2,
        data: {
          redis: {
            operation: 'get'
          }
        }
      };

      it('should correctly transform the Redis span by renaming the operation property', () => {
        span.data.redis.operation = 'set';
        spanBuffer.addSpan(span);
        const spans = spanBuffer.getAndResetSpans();
        expect(spans).to.have.lengthOf(1);
        expect(span.data.redis.command).to.equal('set');
        expect(span.data.redis).to.not.have.property('operation');
      });
      it('should return the span unchanged for non-mapped types', () => {
        span.n = 'http';
        spanBuffer.addSpan(span);
        const spans = spanBuffer.getAndResetSpans();
        expect(spans).to.have.lengthOf(1);
        expect(span).to.deep.equal(span);
      });
    });
  });

  function timestamp(offset) {
    return start + offset;
  }

  function createSpans(duration1, gap, duration2, offset = 0) {
    return [createSpan(offset, duration1, '1'), createSpan(offset + duration1 + gap, duration2, '2')];
  }

  function createSpan(startOffset = 0, duration = 5, spanId = '?') {
    return {
      n: 'batchable',
      t: traceId1,
      p: parentId1,
      s: spanId,
      ts: timestamp(startOffset),
      d: duration,
      ec: 0
    };
  }

  function verifyNoBatching(span1, span2) {
    spanBuffer.addSpan(span1);
    spanBuffer.addSpan(span2);
    expectNoBatching();
  }

  function expectNoBatching() {
    expect(spanBuffer.getAndResetSpans()).to.have.lengthOf(2);
  }

  function verifyBatching(span1, span2) {
    spanBuffer.addSpan(span1);
    spanBuffer.addSpan(span2);
    return expectBatching();
  }

  function expectBatching() {
    const spans = spanBuffer.getAndResetSpans();
    expect(spans).to.have.lengthOf(1);
    return spans[0];
  }
});
