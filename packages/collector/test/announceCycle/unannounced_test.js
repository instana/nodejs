/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const chai = require('chai');
const proxyquire = require('proxyquire');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');

const expect = chai.expect;
chai.use(sinonChai);

const { secrets, tracing } = require('@instana/core');
const { constants } = tracing;

describe('agent ready state', () => {
  let unannouncedState;
  let agentResponse;

  let pidStoreStub;
  let agentOptsStub;
  let tracingStub;
  let secretsStub;

  describe('enter', () => {
    before(() => {
      // This value will be modified by individual tests before it is handed over to the unnanounced module.
      agentResponse = {};

      pidStoreStub = {};
      agentOptsStub = {};
      tracingStub = sinon.stub(tracing);
      secretsStub = sinon.stub(secrets);

      unannouncedState = proxyquire('../../src/announceCycle/unannounced', {
        '@instana/core': {
          secrets: secretsStub,
          tracing: tracingStub
        },
        '../pidStore': pidStoreStub,
        '../agent/opts': agentOptsStub,
        '../agentConnection': {
          announceNodeCollector: cb => {
            setImmediate(() => {
              cb(null, JSON.stringify(agentResponse));
            });
          }
        }
      });
    });

    afterEach(() => {
      tracingStub.setKafkaTracingConfig.reset();
      tracingStub.enableSpanBatching.reset();
      tracingStub.setExtraHttpHeadersToCapture.reset();
      secretsStub.setMatcher.reset();
      pidStoreStub.pid = undefined;
      agentOptsStub.agentUuid = undefined;
    });

    after(() => {
      sinon.restore();
    });

    it('should transition to announced', done => {
      unannouncedState.enter({
        transitionTo: nextState => {
          expect(nextState).to.equal('announced');
          done();
        }
      });
    });

    it('should use pid from response', done => {
      agentResponse = { pid: 42 };
      unannouncedState.enter({
        transitionTo: () => {
          expect(pidStoreStub.pid).to.equal(42);
          done();
        }
      });
    });

    it('should use agent UUID from response', done => {
      agentResponse = { agentUuid: 'some agent uuid' };
      unannouncedState.enter({
        transitionTo: () => {
          expect(agentOptsStub.agentUuid).to.equal('some agent uuid');
          done();
        }
      });
    });

    it('should use secrets config response', done => {
      agentResponse = {
        secrets: {
          matcher: 'equals',
          list: ['hidden', 'opaque']
        }
      };
      unannouncedState.enter({
        transitionTo: () => {
          expect(secretsStub.setMatcher).to.have.been.calledWith('equals', ['hidden', 'opaque']);
          done();
        }
      });
    });

    it('should apply extra http header configuration from tracing attribute', done => {
      agentResponse = {
        tracing: {
          'extra-http-headers': ['x-extra-header-1', 'X-Extra-Header-2']
        }
      };
      unannouncedState.enter({
        transitionTo: () => {
          expect(tracingStub.setExtraHttpHeadersToCapture).to.have.been.calledWith([
            'x-extra-header-1',
            'x-extra-header-2'
          ]);
          done();
        }
      });
    });

    it('should apply extra http header configuration from legacy agent response', done => {
      agentResponse = {
        extraHeaders: ['x-extra-header-3', 'X-Extra-Header-4']
      };
      unannouncedState.enter({
        transitionTo: () => {
          expect(tracingStub.setExtraHttpHeadersToCapture).to.have.been.calledWith([
            'x-extra-header-3',
            'x-extra-header-4'
          ]);
          done();
        }
      });
    });

    it('should use default values for kafka tracing configuration', done => {
      agentResponse = {
        tracing: {
          kafka: {}
        }
      };
      unannouncedState.enter({
        transitionTo: () => {
          expect(tracingStub.setKafkaTracingConfig).to.have.been.calledWith({
            traceCorrelation: constants.kafkaTraceCorrelationDefault,
            headerFormat: constants.kafkaHeaderFormatDefault
          });
          done();
        }
      });
    });

    it('should apply the kafka tracing configuration', done => {
      agentResponse = {
        tracing: {
          kafka: {
            'trace-correlation': false,
            'header-format': 'string'
          }
        }
      };
      unannouncedState.enter({
        transitionTo: () => {
          expect(tracingStub.setKafkaTracingConfig).to.have.been.calledWith({
            traceCorrelation: false,
            headerFormat: 'string'
          });
          done();
        }
      });
    });

    it('should apply span batching configuratino', done => {
      agentResponse = {
        spanBatchingEnabled: true
      };
      unannouncedState.enter({
        transitionTo: () => {
          expect(tracingStub.enableSpanBatching).to.have.been.called;
          done();
        }
      });
    });
  });
});
