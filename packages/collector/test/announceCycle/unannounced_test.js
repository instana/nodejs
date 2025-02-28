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
const testUtils = require('@instana/core/test/test_util');

describe('unannounced state', () => {
  let unannouncedState;

  let agentOptsStub;
  let agentConnectionStub;
  let tracingStub;
  let secretsStub;
  let pidStoreStub;

  describe('enter', () => {
    before(() => {
      agentOptsStub = {};
      agentConnectionStub = sinon.stub(agentConnection);
      tracingStub = sinon.stub(tracing);
      secretsStub = sinon.stub(secrets);
      pidStoreStub = sinon.stub();

      unannouncedState = proxyquire('../../src/announceCycle/unannounced', {
        '@instana/core': {
          secrets: secretsStub,
          tracing: tracingStub
        },
        '../agent/opts': agentOptsStub,
        '../agentConnection': agentConnectionStub
      });

      unannouncedState.init({ logger: testUtils.createFakeLogger() }, pidStoreStub);
    });

    afterEach(() => {
      agentConnectionStub.announceNodeCollector.reset();
      tracingStub.activate.reset();
      secretsStub.setMatcher.reset();
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
    it('should  apply the configuration to ignore a single endpoint for a package', done => {
      prepareAnnounceResponse({
        tracing: {
          'ignore-endpoints': {
            redis: ['get']
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

    it('should apply the configuration to ignore multiple endpoints for a package', done => {
      prepareAnnounceResponse({
        tracing: {
          'ignore-endpoints': {
            redis: ['SET', 'GET']
          }
        }
      });
      unannouncedState.enter({
        transitionTo: () => {
          expect(agentOptsStub.config).to.deep.equal({
            tracing: {
              ignoreEndpoints: {
                redis: ['set', 'get']
              }
            }
          });
          done();
        }
      });
    });

    it('should apply tracing configuration to ignore specified endpoints across different packages', done => {
      prepareAnnounceResponse({
        tracing: {
          'ignore-endpoints': {
            REDIS: ['GET', 'SET'],
            dynamodb: ['query']
          }
        }
      });
      unannouncedState.enter({
        transitionTo: () => {
          expect(agentOptsStub.config).to.deep.equal({
            tracing: {
              ignoreEndpoints: {
                redis: ['get', 'set'],
                dynamodb: ['query']
              }
            }
          });
          done();
        }
      });
    });

    it('should set ignoreEndpoints to null when the format is invalid', done => {
      prepareAnnounceResponse({
        tracing: {
          'ignore-endpoints': {
            REDIS: 'get|set',
            dynamodb: 'query'
          }
        }
      });
      unannouncedState.enter({
        transitionTo: () => {
          expect(agentOptsStub.config).to.deep.equal({
            tracing: {
              ignoreEndpoints: {
                redis: null,
                dynamodb: null
              }
            }
          });
          done();
        }
      });
    });
    it('should correctly set ignoreEndpoints when both string and object-based filtering applied', done => {
      prepareAnnounceResponse({
        tracing: {
          'ignore-endpoints': {
            kafka: [
              'consume',
              'publish',
              {
                endpoints: ['topic1', 'topic2'],
                methods: ['*']
              },
              {
                endpoints: ['topic3'],
                methods: ['publish']
              }
            ],
            redis: ['type', 'get']
          }
        }
      });
      unannouncedState.enter({
        transitionTo: () => {
          expect(agentOptsStub.config).to.deep.equal({
            tracing: {
              ignoreEndpoints: {
                kafka: [
                  'consume',
                  'publish',
                  {
                    endpoints: ['topic1', 'topic2'],
                    methods: ['*']
                  },
                  {
                    endpoints: ['topic3'],
                    methods: ['publish']
                  }
                ],
                redis: ['type', 'get']
              }
            }
          });
          done();
        }
      });
    });

    it('should correctly parse when the config contains spaces and capital casing', done => {
      prepareAnnounceResponse({
        tracing: {
          'ignore-endpoints': {
            'KAFKA  ': [
              {
                'Methods  ': ['*'],
                Endpoints: ['TOPIC1  ', 'topic2   ']
              },
              {
                METHODS: ['  PUBLISH'],
                '    endpoints': ['Topic3  ']
              }
            ]
          }
        }
      });
      unannouncedState.enter({
        transitionTo: () => {
          expect(agentOptsStub.config).to.deep.equal({
            tracing: {
              ignoreEndpoints: {
                kafka: [
                  { methods: ['*'], endpoints: ['topic1', 'topic2'] },
                  { methods: ['publish'], endpoints: ['topic3'] }
                ]
              }
            }
          });
          done();
        }
      });
    });

    it('should correctly handle only object-based ignoreEndpoints', done => {
      prepareAnnounceResponse({
        tracing: {
          'ignore-endpoints': {
            kafka: [
              {
                methods: ['*'],
                endpoints: ['topic1', 'topic2']
              },
              {
                methods: ['publish'],
                endpoints: ['topic3']
              }
            ]
          }
        }
      });
      unannouncedState.enter({
        transitionTo: () => {
          expect(agentOptsStub.config).to.deep.equal({
            tracing: {
              ignoreEndpoints: {
                kafka: [
                  { methods: ['*'], endpoints: ['topic1', 'topic2'] },
                  { methods: ['publish'], endpoints: ['topic3'] }
                ]
              }
            }
          });
          done();
        }
      });
    });

    it('should correctly handle ignoreEndpoints when only endpoints are provided without methods', done => {
      prepareAnnounceResponse({
        tracing: {
          'ignore-endpoints': {
            kafka: [
              {
                endpoints: ['topic1', 'topic2']
              }
            ]
          }
        }
      });
      unannouncedState.enter({
        transitionTo: () => {
          expect(agentOptsStub.config).to.deep.equal({
            tracing: {
              ignoreEndpoints: {
                kafka: [{ endpoints: ['topic1', 'topic2'] }]
              }
            }
          });
          done();
        }
      });
    });

    it('should correctly handle ignoreEndpoints when only methods are provided without endpoints', done => {
      prepareAnnounceResponse({
        tracing: {
          'ignore-endpoints': {
            kafka: [
              {
                methods: ['publish']
              }
            ]
          }
        }
      });
      unannouncedState.enter({
        transitionTo: () => {
          expect(agentOptsStub.config).to.deep.equal({
            tracing: {
              ignoreEndpoints: {
                kafka: [{ methods: ['publish'] }]
              }
            }
          });
          done();
        }
      });
    });

    it('should correctly parse ignoreEndpoints when methods are provided in string format without endpoints', done => {
      prepareAnnounceResponse({
        tracing: {
          'ignore-endpoints': {
            kafka: [
              {
                methods: 'publish'
              }
            ]
          }
        }
      });
      unannouncedState.enter({
        transitionTo: () => {
          expect(agentOptsStub.config).to.deep.equal({
            tracing: {
              ignoreEndpoints: {
                kafka: [{ methods: ['publish'] }]
              }
            }
          });
          done();
        }
      });
    });

    it('should correctly parse ignoreEndpoints when methods are provided in string format without endpoints', done => {
      prepareAnnounceResponse({
        tracing: {
          'ignore-endpoints': {
            kafka: [
              {
                methods: 'publish',
                endpoints: 'topic1'
              }
            ]
          }
        }
      });
      unannouncedState.enter({
        transitionTo: () => {
          expect(agentOptsStub.config).to.deep.equal({
            tracing: {
              ignoreEndpoints: {
                kafka: [{ methods: ['publish'], endpoints: ['topic1'] }]
              }
            }
          });
          done();
        }
      });
    });

    it('should handle ignoreEndpoints with empty arrays gracefully', done => {
      prepareAnnounceResponse({
        tracing: {
          'ignore-endpoints': {
            kafka: []
          }
        }
      });

      unannouncedState.enter({
        transitionTo: () => {
          expect(agentOptsStub.config).to.deep.equal({
            tracing: {
              ignoreEndpoints: {
                kafka: []
              }
            }
          });
          done();
        }
      });
    });

    it('should correctly parse ignoreEndpoints when new fields are added', done => {
      prepareAnnounceResponse({
        tracing: {
          'ignore-endpoints': {
            kafka: [
              {
                methods: ['publish'],
                endpoints: ['topic1'],
                groups: ['group1']
              }
            ]
          }
        }
      });
      unannouncedState.enter({
        transitionTo: () => {
          expect(agentOptsStub.config).to.deep.equal({
            tracing: {
              ignoreEndpoints: {
                kafka: [{ methods: ['publish'], endpoints: ['topic1'], groups: ['group1'] }]
              }
            }
          });
          done();
        }
      });
    });

    it('should ignore invalid data types in ignoreEndpoints', done => {
      prepareAnnounceResponse({
        tracing: {
          'ignore-endpoints': {
            kafka: [123, true, null, undefined, {}]
          }
        }
      });

      unannouncedState.enter({
        transitionTo: () => {
          expect(agentOptsStub.config).to.deep.equal({
            tracing: {
              ignoreEndpoints: {}
            }
          });
          done();
        }
      });
    });

    it('should handle deeply nested invalid structures', done => {
      prepareAnnounceResponse({
        tracing: {
          'ignore-endpoints': {
            kafka: [
              {
                endpoints: [{ topic: 'nestedTopic' }],
                methods: ['*']
              }
            ]
          }
        }
      });

      unannouncedState.enter({
        transitionTo: () => {
          expect(agentOptsStub.config).to.deep.equal({
            tracing: {
              ignoreEndpoints: {}
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
