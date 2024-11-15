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
const agentConnection = require('../../src/agentConnection');

describe('unannounced state', () => {
  let unannouncedState;

  let pidStoreStub;
  let agentOptsStub;
  let agentConnectionStub;
  let tracingStub;
  let secretsStub;

  describe('enter', () => {
    before(() => {
      pidStoreStub = {};
      agentOptsStub = {};
      agentConnectionStub = sinon.stub(agentConnection);
      tracingStub = sinon.stub(tracing);
      secretsStub = sinon.stub(secrets);

      unannouncedState = proxyquire('../../src/announceCycle/unannounced', {
        '@instana/core': {
          secrets: secretsStub,
          tracing: tracingStub
        },
        '../pidStore': pidStoreStub,
        '../agent/opts': agentOptsStub,
        '../agentConnection': agentConnectionStub
      });
    });

    afterEach(() => {
      agentConnectionStub.announceNodeCollector.reset();
      tracingStub.activate.reset();
      secretsStub.setMatcher.reset();
      pidStoreStub.pid = undefined;
      agentOptsStub.agentUuid = undefined;
      agentOptsStub.config = {};
    });

    after(() => {
      sinon.restore();
    });

    it('should transition to announced', done => {
      prepareAnnounceResponse({});
      unannouncedState.enter({
        transitionTo: nextState => {
          expect(nextState).to.equal('announced');
          done();
        }
      });
    });

    it('should use pid from response', done => {
      prepareAnnounceResponse({ pid: 42 });
      unannouncedState.enter({
        transitionTo: () => {
          expect(pidStoreStub.pid).to.equal(42);
          done();
        }
      });
    });

    it('should use agent UUID from response', done => {
      prepareAnnounceResponse({
        agentUuid: 'some agent uuid'
      });
      unannouncedState.enter({
        transitionTo: () => {
          expect(agentOptsStub.agentUuid).to.equal('some agent uuid');
          done();
        }
      });
    });

    it('should use secrets config response', done => {
      prepareAnnounceResponse({
        secrets: {
          matcher: 'equals',
          list: ['hidden', 'opaque']
        }
      });
      unannouncedState.enter({
        transitionTo: () => {
          expect(secretsStub.setMatcher).to.have.been.calledWith('equals', ['hidden', 'opaque']);
          done();
        }
      });
    });

    it('should apply extra http header configuration from tracing attribute', done => {
      prepareAnnounceResponse({
        tracing: {
          'extra-http-headers': ['x-extra-header-1', 'X-Extra-Header-2']
        }
      });
      unannouncedState.enter({
        transitionTo: () => {
          expect(agentOptsStub.config).to.deep.equal({
            tracing: {
              http: {
                extraHttpHeadersToCapture: ['x-extra-header-1', 'x-extra-header-2']
              }
            }
          });
          done();
        }
      });
    });

    it('should apply extra http header configuration from legacy agent response', done => {
      prepareAnnounceResponse({
        extraHeaders: ['x-extra-header-3', 'X-Extra-Header-4']
      });
      unannouncedState.enter({
        transitionTo: () => {
          expect(agentOptsStub.config).to.deep.equal({
            tracing: {
              http: {
                extraHttpHeadersToCapture: ['x-extra-header-3', 'x-extra-header-4']
              }
            }
          });
          done();
        }
      });
    });

    it('should use default values for kafka tracing configuration', done => {
      prepareAnnounceResponse({
        tracing: {
          kafka: {}
        }
      });
      unannouncedState.enter({
        transitionTo: () => {
          expect(agentOptsStub.config).to.deep.equal({
            tracing: {
              kafka: {
                traceCorrelation: constants.kafkaTraceCorrelationDefault
              }
            }
          });
          done();
        }
      });
    });

    it('should apply the kafka tracing configuration', done => {
      prepareAnnounceResponse({
        tracing: {
          kafka: {
            'trace-correlation': false
          }
        }
      });
      unannouncedState.enter({
        transitionTo: () => {
          expect(agentOptsStub.config).to.deep.equal({
            tracing: {
              kafka: {
                traceCorrelation: false
              }
            }
          });
          done();
        }
      });
    });

    it('should apply span batching configuration', done => {
      prepareAnnounceResponse({
        tracing: { 'span-batching-enabled': true }
      });
      unannouncedState.enter({
        transitionTo: () => {
          expect(agentOptsStub.config).to.deep.equal({
            tracing: {
              spanBatchingEnabled: true
            }
          });
          done();
        }
      });
    });

    it('should apply legacy span batching configuration', done => {
      prepareAnnounceResponse({ spanBatchingEnabled: true });
      unannouncedState.enter({
        transitionTo: () => {
          expect(agentOptsStub.config).to.deep.equal({
            tracing: {
              spanBatchingEnabled: true
            }
          });
          done();
        }
      });
    });
    it('should apply the configuration to ignore specified endpoints for a single technology', done => {
      prepareAnnounceResponse({
        tracing: {
          'ignore-endpoints': {
            redis: 'get'
          }
        }
      });
      unannouncedState.enter({
        transitionTo: () => {
          expect(agentOptsStub.config).to.deep.equal({
            tracing: {
              ignoreEndpoints: {
                redis: ['get']
              }
            }
          });
          done();
        }
      });
    });
    it('should apply the tracing configuration to ignore multiple endpoints across different technologies', done => {
      prepareAnnounceResponse({
        tracing: {
          'ignore-endpoints': {
            REDIS: 'get | type',
            dynamodb: 'query'
          }
        }
      });
      unannouncedState.enter({
        transitionTo: () => {
          expect(agentOptsStub.config).to.deep.equal({
            tracing: {
              ignoreEndpoints: {
                redis: ['get', 'type'],
                dynamodb: ['query']
              }
            }
          });
          done();
        }
      });
    });

    function prepareAnnounceResponse(announceResponse) {
      agentConnectionStub.announceNodeCollector.callsArgWithAsync(0, null, JSON.stringify(announceResponse));
    }
  });
});
