/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2017
 */

'use strict';

const proxyquire = require('proxyquire');
const expect = require('chai').expect;
const testUtils = require('../test_util');
const constants = require('../../src/tracing/constants');

describe('tracing/cls', () => {
  let cls;

  beforeEach(() => {
    // reload to clear vars
    cls = proxyquire('../../src/tracing/cls', {});
    cls.init({ logger: testUtils.createFakeLogger() });
  });

  it('must not have an active context initially', () => {
    expect(cls.getCurrentSpan()).to.equal(undefined);
  });

  it('must initialize a new valid span', () => {
    cls.ns.run(() => {
      const span = cls.startSpan({
        spanName: 'cls-test-run',
        kind: constants.EXIT
      });
      expect(span).to.be.an('object');
      expect(span.n).to.equal('cls-test-run');
      expect(span.t).to.be.a('string');
      expect(span.s).to.be.a('string');
      expect(span.k).to.equal(constants.EXIT);
      expect(span.async).to.not.exist;
      expect(span.error).to.not.exist;
      expect(span.ec).to.equal(0);
      expect(span.ts).to.be.a('number');
      expect(span.d).to.equal(0);
      expect(span.stack).to.deep.equal([]);
      expect(span.data).to.be.an('object');
      expect(Object.keys(span.data)).to.have.lengthOf(0);
    });
  });

  it('can create spans without config, identity provider, name and direction in a pinch', () => {
    cls.init({ logger: testUtils.createFakeLogger() });
    cls.ns.run(() => {
      const span = cls.startSpan();
      expect(span).to.be.an('object');
      expect(span.t).to.be.a('string');
      expect(span.s).to.be.a('string');
      expect(span.k).to.equal(2);
      expect(span.async).to.not.exist;
      expect(span.error).to.not.exist;
      expect(span.ec).to.equal(0);
      expect(span.ts).to.be.a('number');
      expect(span.d).to.equal(0);
      expect(span.stack).to.deep.equal([]);
      expect(span.data).to.be.an('object');
      expect(Object.keys(span.data)).to.have.lengthOf(0);
    });
  });

  it('must not set span.f without process identity provider', () => {
    cls.ns.run(() => {
      const newSpan = cls.startSpan({
        spanName: 'cls-test-run',
        kind: constants.EXIT
      });

      expect(newSpan).to.not.have.property('f');
    });
  });

  it('must not set span.f if process identity provider does not support getFrom', () => {
    cls.init({ logger: testUtils.createFakeLogger() }, {});
    cls.ns.run(() => {
      const newSpan = cls.startSpan({
        spanName: 'cls-test-run',
        kind: constants.EXIT
      });

      expect(newSpan).to.not.have.property('f');
    });
  });

  it('must use process identity provider', () => {
    cls.init(
      { logger: testUtils.createFakeLogger() },
      {
        getFrom: function () {
          return {
            e: String(process.pid),
            h: undefined
          };
        }
      }
    );
    cls.ns.run(() => {
      const newSpan = cls.startSpan({
        spanName: 'cls-test-run',
        kind: constants.EXIT
      });

      expect(newSpan.f).to.deep.equal({
        e: String(process.pid),
        h: undefined
      });
    });
  });

  it('new spans must inherit from current span IDs', () => {
    let parentSpan;
    let newSpan;

    cls.ns.run(() => {
      parentSpan = cls.startSpan({
        spanName: 'Mr-Brady',
        kind: constants.ENTRY
      });
      newSpan = cls.startSpan({
        spanName: 'Peter-Brady',
        kind: constants.EXIT
      });
    });
    expect(newSpan.t).to.equal(parentSpan.t);
    expect(newSpan.p).to.equal(parentSpan.s);
  });

  it('must pass trace suppression configuration across spans', () => {
    cls.ns.run(() => {
      cls.setTracingLevel('0');
      expect(cls.tracingSuppressed()).to.equal(true);
      cls.startSpan({
        spanName: 'Antonio-Andolini',
        kind: constants.ENTRY
      });
      expect(cls.tracingSuppressed()).to.equal(true);

      cls.startSpan({
        spanName: 'Vito-Corleone',
        kind: constants.EXIT
      });
      expect(cls.tracingSuppressed()).to.equal(true);

      cls.startSpan({
        spanName: 'Michael-Corleone',
        kind: constants.EXIT
      });
      expect(cls.tracingSuppressed()).to.equal(true);

      cls.ns.run(() => {
        cls.setTracingLevel('1');
        expect(cls.tracingSuppressed()).to.equal(false);

        cls.startSpan({
          spanName: 'Antonio-Andolini',
          kind: constants.EXIT
        });
        expect(cls.tracingSuppressed()).to.equal(false);

        cls.startSpan({
          spanName: 'Vito-Corleone',
          kind: constants.EXIT
        });
        expect(cls.tracingSuppressed()).to.equal(false);

        cls.startSpan({
          spanName: 'Michael-Corleone',
          kind: constants.EXIT
        });
        expect(cls.tracingSuppressed()).to.equal(false);

        cls.ns.run(() => {
          cls.setTracingLevel('0');
          expect(cls.tracingSuppressed()).to.equal(true);

          cls.startSpan({
            spanName: 'Antonio-Andolini',
            kind: constants.EXIT
          });
          expect(cls.tracingSuppressed()).to.equal(true);

          cls.startSpan({
            spanName: 'Vito-Corleone',
            kind: constants.EXIT
          });
          expect(cls.tracingSuppressed()).to.equal(true);

          cls.startSpan({
            spanName: 'Michael-Corleone',
            kind: constants.EXIT
          });
          expect(cls.tracingSuppressed()).to.equal(true);

          cls.ns.run(() => {
            expect(cls.tracingSuppressed()).to.equal(true);

            cls.startSpan({
              spanName: 'Antonio-Andolini',
              kind: constants.EXIT
            });
            expect(cls.tracingSuppressed()).to.equal(true);

            cls.startSpan({
              spanName: 'Vito-Corleone',
              kind: constants.EXIT
            });
            expect(cls.tracingSuppressed()).to.equal(true);

            cls.startSpan({
              spanName: 'Michael-Corleone',
              kind: constants.EXIT
            });
            expect(cls.tracingSuppressed()).to.equal(true);
          });
        });
      });
    });
  });

  it('new spans must have direction set', () => {
    let entrySpan;
    let exitSpan;
    let intermediateSpan;

    cls.ns.run(() => {
      entrySpan = cls.startSpan({
        spanName: 'node.http.server',
        kind: constants.ENTRY
      });
      exitSpan = cls.startSpan({
        spanName: 'mongo',
        kind: constants.EXIT
      });
      intermediateSpan = cls.startSpan({
        spanName: 'intermediate',
        kind: constants.INTERMEDIATE
      });
    });

    expect(entrySpan.k).to.equal(constants.ENTRY);
    expect(constants.isEntrySpan(entrySpan)).to.equal(true);
    expect(constants.isExitSpan(entrySpan)).to.equal(false);
    expect(constants.isIntermediateSpan(entrySpan)).to.equal(false);

    expect(exitSpan.k).to.equal(constants.EXIT);
    expect(constants.isEntrySpan(exitSpan)).to.equal(false);
    expect(constants.isExitSpan(exitSpan)).to.equal(true);
    expect(constants.isIntermediateSpan(exitSpan)).to.equal(false);

    expect(intermediateSpan.k).to.equal(constants.INTERMEDIATE);
    expect(constants.isEntrySpan(intermediateSpan)).to.equal(false);
    expect(constants.isExitSpan(intermediateSpan)).to.equal(false);
    expect(constants.isIntermediateSpan(intermediateSpan)).to.equal(true);
  });

  it('new spans need to have an empty data object', () => {
    cls.init({ logger: testUtils.createFakeLogger() }, {});
    cls.ns.run(() => {
      const span = cls.startSpan({
        spanName: 'something.something',
        kind: constants.ENTRY
      });
      expect(span.data).to.be.an('object');
      expect(Object.keys(span.data)).to.have.lengthOf(0);
      expect(span.data.service).to.not.exist;
    });
  });

  it('must use the configured service name', () => {
    cls.init({ serviceName: 'Forsvarets Efterretningstjeneste', logger: testUtils.createFakeLogger() }, {});
    cls.ns.run(() => {
      const span = cls.startSpan({
        spanName: 'something.something',
        kind: constants.ENTRY
      });
      expect(span.data.service).to.equal('Forsvarets Efterretningstjeneste');
    });
  });

  it('must clean up span data from contexts once the span has been transmitted', () => {
    cls.ns.run(context => {
      expect(context[cls.currentEntrySpanKey]).to.equal(undefined);
      expect(context[cls.currentSpanKey]).to.equal(undefined);

      const span = cls.startSpan({
        spanName: 'node.http.server',
        kind: constants.ENTRY
      });
      expect(context[cls.currentEntrySpanKey]).to.equal(span);
      expect(context[cls.currentSpanKey]).to.equal(span);

      span.cleanup();

      expect(context[cls.currentEntrySpanKey]).to.equal(undefined);
      expect(context[cls.currentSpanKey]).to.equal(undefined);
    });
  });

  it('must allow an exit span without a parent span', () => {
    cls.ns.run(() => {
      cls.setTracingLevel('1');
      cls.init({
        tracing: {
          allowRootExitSpan: true
        }
      });

      cls.startSpan({
        spanName: 'Vito-Corleone',
        kind: constants.ENTRY
      });

      expect(cls.skipExitTracing()).to.equal(false);
    });
  });

  it('must skip an exit span without a parent span', () => {
    cls.ns.run(() => {
      cls.setTracingLevel('1');
      cls.init({
        tracing: {
          allowRootExitSpan: false
        }
      });

      expect(cls.skipExitTracing()).to.equal(true);

      cls.startSpan({
        spanName: 'Antonio-Andolini',
        kind: constants.EXIT
      });
      expect(cls.skipExitTracing()).to.equal(true);
    });
  });

  it('must store reduced backup of span data on cleanup', () => {
    cls.ns.run(context => {
      expect(context[cls.currentEntrySpanKey]).to.equal(undefined);
      expect(context[cls.currentSpanKey]).to.equal(undefined);

      const span = cls.startSpan({
        spanName: 'node.http.server',
        kind: constants.ENTRY
      });
      span.data.much = 'data';
      span.stack = ['a', 'b', 'c'];
      expect(context[cls.currentEntrySpanKey]).to.equal(span);
      expect(context[cls.currentSpanKey]).to.equal(span);

      span.cleanup();

      const reducedSpan = context[cls.reducedSpanKey];

      expect(Object.keys(reducedSpan)).to.have.lengthOf(5);
      expect(reducedSpan.n).to.equal(span.n);
      expect(reducedSpan.t).to.equal(span.t);
      expect(reducedSpan.s).to.equal(span.s);
      expect(reducedSpan.p).to.equal(span.p);
      expect(reducedSpan.k).to.equal(span.k);
      expect(reducedSpan.data).to.not.exist;
      expect(reducedSpan.stack).to.not.exist;
    });
  });
  it('should return the span with correct data when span data is provided', () => {
    cls.ns.run(() => {
      const span = cls.startSpan({
        spanName: 'redis',
        kind: constants.EXIT,
        spanData: {
          redis: {
            operation: 'get',
            connection: 'http://localhost'
          }
        }
      });
      expect(span).to.be.an('object');
      expect(span.n).to.equal('redis');
      expect(span.t).to.be.a('string');
      expect(span.s).to.be.a('string');
      expect(span.k).to.equal(constants.EXIT);
      expect(span.error).to.not.exist;
      expect(span.ec).to.equal(0);
      expect(span.ts).to.be.a('number');
      expect(span.d).to.equal(0);
      expect(span.stack).to.deep.equal([]);
      expect(span.data).to.be.an('object');
      expect(Object.keys(span.data)).to.have.lengthOf(1);
      expect(span.data.redis).to.be.exist;
      expect(span.data.redis.operation).to.equal('get');
      expect(span.data.redis.connection).to.equal('http://localhost');
    });
  });
});
