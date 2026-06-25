/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const chai = require('chai');
const { expect } = chai;
const proxyquire = require('proxyquire');
const EventEmitter = require('events');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');
const testUtils = require('@_local/core/test/test_util');

chai.use(sinonChai);

class MockRequestEmitter extends EventEmitter {
  setTimeout() {}

  write(payload) {
    this.payload = payload;
  }

  end() {}
}

class MockResponseEmitter extends EventEmitter {
  setEncoding() {}
}

describe('agent connection/bazel', function () {
  let agentConnection;
  let lastRequest;

  describe("Bazel's node-patches are present", () => {
    before(() => {
      agentConnection = proxyquire('@_local/collector/src/agentConnection', {
        // stub out the http communication part of the announce request
        '@instana/core': mockInstanaCoreHttp()
      });

      agentConnection.init(
        { logger: testUtils.createFakeLogger(), tracing: { otlp: { enabled: false } } },
        { pid: 1234 }
      );
    });

    it('should remove the leading path segmentes which node-patches prepends', done => {
      agentConnection.announceNodeCollector(() => {
        const announcePayload = JSON.parse(lastRequest.payload.toString());
        expect(announcePayload.fd).to.equal('13');
        expect(announcePayload.inode).to.equal('socket:[12345]');
        done();
      });
    });
  });

  describe("Bazel's node-patches are not present", () => {
    before(() => {
      agentConnection = proxyquire('@_local/collector/src/agentConnection', {
        // Stub out the fs part part of the fd/inode lookup (the readlinkSync call), and act as if node-patches from
        // Bazel were not active, that is, act like an unpatched fs modules would work on Linux and return an
        // unqualified file name (no absolute path) from readlinkSync.
        fs: mockFs('socket:[12345]'),

        // stub out the http communication part of the announce request
        '@instana/core': mockInstanaCoreHttp()
      });

      agentConnection.init(
        { logger: testUtils.createFakeLogger(), tracing: { otlp: { enabled: false } } },
        { pid: 1234 }
      );
    });

    it('should not modify the readlinkSync result', done => {
      agentConnection.announceNodeCollector(() => {
        const announcePayload = JSON.parse(lastRequest.payload.toString());
        expect(announcePayload.fd).to.equal('13');
        expect(announcePayload.inode).to.equal('socket:[12345]');
        done();
      });
    });
  });

  function mockFs(readlinkSyncResult) {
    return {
      readlinkSync: () => readlinkSyncResult
    };
  }

  function mockInstanaCoreHttp() {
    return {
      uninstrumentedHttp: {
        http: {
          request: function (options, responseCallback) {
            const req = new MockRequestEmitter();
            lastRequest = req;

            setImmediate(() => {
              req.emit('socket', {
                _handle: {
                  fd: '13'
                }
              });

              setImmediate(() => {
                const res = new MockResponseEmitter();
                res.statusCode = 200;
                responseCallback(res);

                setImmediate(() => {
                  res.emit('end');
                });
              });
            });
            return req;
          }
        }
      },
      // Stub out the fs part part of the fd/inode lookup (the readlinkSync call), and act as if node-patches from
      // Bazel were active, that is, return an absolute path from readlinkSync.
      uninstrumentedFs: mockFs(`/proc/${process.pid}/fd/socket:[12345]`)
    };
  }
});

describe('agent connection/export endpoints', function () {
  let agentConnection;
  let httpRequestStub;
  let logger;
  let requestTimeout;
  let pidStore;
  let agentOptsStub;
  let requests;
  let responseQueue;

  class ExportRequestEmitter extends EventEmitter {
    constructor() {
      super();
      this.destroyed = false;
    }

    setTimeout(timeout, handler) {
      this.timeout = timeout;
      this.timeoutHandler = handler;
    }

    write(payload) {
      this.payload = payload;
    }

    end() {
      if (this.autoError) {
        setImmediate(() => this.emit('error', this.autoError));
        return;
      }

      const nextResponse = responseQueue.shift() || { statusCode: 200, body: '' };
      setImmediate(() => {
        const res = new MockResponseEmitter();
        res.statusCode = nextResponse.statusCode;
        this.response = res;
        this.responseCallback(res);

        setImmediate(() => {
          if (nextResponse.body) {
            res.emit('data', nextResponse.body);
          }
          res.emit('end');
        });
      });
    }

    destroy() {
      this.destroyed = true;
    }
  }

  beforeEach(() => {
    requests = [];
    responseQueue = [];
    logger = testUtils.createFakeLogger();
    sinon.spy(logger, 'error');
    sinon.spy(logger, 'debug');
    sinon.spy(logger, 'trace');

    requestTimeout = 5000;
    pidStore = { pid: 4711 };
    agentOptsStub = {
      host: '127.0.0.1',
      port: 42699,
      requestTimeout
    };

    httpRequestStub = sinon.stub().callsFake((options, responseCallback) => {
      const req = new ExportRequestEmitter();
      req.options = options;
      req.responseCallback = responseCallback;
      requests.push(req);
      return req;
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  function initAgentConnection(customConfig = {}) {
    const config = {
      logger,
      tracing: {
        otlp: {
          enabled: false,
          port: 4318
        }
      },
      ...customConfig
    };

    if (!config.tracing) {
      config.tracing = {
        otlp: {
          enabled: false,
          port: 4318
        }
      };
    }
    if (!config.tracing.otlp) {
      config.tracing.otlp = {
        enabled: false,
        port: 4318
      };
    }

    agentConnection = proxyquire('@_local/collector/src/agentConnection', {
      '@instana/core': {
        util: {
          atMostOnce: (_name, fn) => fn,
          propertySizes: () => []
        },
        uninstrumentedHttp: {
          http: {
            request: httpRequestStub,
            agent: {}
          }
        },
        uninstrumentedFs: {
          readFileSync: () => null
        }
      },
      './agent/opts': agentOptsStub,
      './cmdline': {
        init: sinon.stub(),
        getCmdline: sinon.stub().returns({})
      }
    });

    agentConnection.init(config, pidStore);
    return agentConnection;
  }

  describe('sendSpans', () => {
    it('should use the legacy Instana traces endpoint when OTLP export is disabled', done => {
      initAgentConnection({
        tracing: {
          otlp: {
            enabled: false,
            port: 4318
          }
        }
      });
      responseQueue.push({ statusCode: 200, body: '' });

      agentConnection.sendSpans([{ n: 'span', k: 1 }], err => {
        expect(err).to.not.exist;
        expect(requests).to.have.lengthOf(1);
        expect(requests[0].options).to.include({
          host: '127.0.0.1',
          port: 42699,
          path: '/com.instana.plugin.nodejs/traces.4711',
          method: 'POST'
        });
        expect(requests[0].options.headers['Content-Type']).to.equal('application/json; charset=UTF-8');
        expect(JSON.parse(requests[0].payload.toString())).to.deep.equal([{ n: 'span', k: 1 }]);
        done();
      });
    });

    it('should use the OTLP traces endpoint when OTLP export is enabled', done => {
      initAgentConnection({
        tracing: {
          otlp: {
            enabled: true,
            port: 4318
          }
        }
      });
      responseQueue.push({ statusCode: 200, body: '' });

      agentConnection.sendSpans([{ n: 'span', k: 1 }], err => {
        expect(err).to.not.exist;
        expect(requests).to.have.lengthOf(1);
        expect(requests[0].options).to.include({
          host: '127.0.0.1',
          port: 4318,
          path: '/v1/traces',
          method: 'POST'
        });
        expect(requests[0].options.headers['Content-Type']).to.equal('application/json; charset=UTF-8');
        expect(JSON.parse(requests[0].payload.toString())).to.deep.equal([{ n: 'span', k: 1 }]);
        done();
      });
    });

    it('should switch endpoint selection after activate enables OTLP export', done => {
      initAgentConnection({
        tracing: {
          otlp: {
            enabled: false,
            port: 4318
          }
        }
      });
      agentConnection.activate({
        tracing: {
          otlp: {
            enabled: true,
            port: 4318
          }
        }
      });
      responseQueue.push({ statusCode: 200, body: '' });

      agentConnection.sendSpans([{ n: 'span', k: 1 }], err => {
        expect(err).to.not.exist;
        expect(requests[0].options.port).to.equal(4318);
        expect(requests[0].options.path).to.equal('/v1/traces');
        done();
      });
    });

    it('should report OTLP traces request failures with the OTLP endpoint in the error message', done => {
      initAgentConnection({
        tracing: {
          otlp: {
            enabled: true,
            port: 4318
          }
        }
      });

      const requestError = new Error('connection refused');
      httpRequestStub.callsFake((options, responseCallback) => {
        const req = new ExportRequestEmitter();
        req.options = options;
        req.responseCallback = responseCallback;
        req.autoError = requestError;
        requests.push(req);
        return req;
      });

      agentConnection.sendSpans([{ n: 'span', k: 1 }], err => {
        expect(err).to.exist;
        expect(err.message).to.equal('Send data to agent via POST /v1/traces. Request failed: connection refused');
        done();
      });
    });

    it('should ignore 404 responses for traces on the OTLP endpoint', done => {
      initAgentConnection({
        tracing: {
          otlp: {
            enabled: true,
            port: 4318
          }
        }
      });
      responseQueue.push({ statusCode: 404, body: '' });

      agentConnection.sendSpans([{ n: 'span', k: 1 }], err => {
        expect(err).to.not.exist;
        done();
      });
    });
  });

  describe('sendMetrics', () => {
    it('should use the legacy Instana metrics endpoint when OTLP export is disabled', done => {
      initAgentConnection({
        tracing: {
          otlp: {
            enabled: false,
            port: 4318
          }
        }
      });
      responseQueue.push({ statusCode: 200, body: '["ok"]' });

      agentConnection.sendMetrics({ m: 1 }, (err, body) => {
        expect(err).to.not.exist;
        expect(body).to.deep.equal(['ok']);
        expect(requests).to.have.lengthOf(1);
        expect(requests[0].options).to.include({
          host: '127.0.0.1',
          port: 42699,
          path: '/com.instana.plugin.nodejs.4711',
          method: 'POST'
        });
        expect(JSON.parse(requests[0].payload.toString())).to.deep.equal({ m: 1 });
        done();
      });
    });

    it('should use the OTLP metrics endpoint when OTLP export is enabled', done => {
      initAgentConnection({
        tracing: {
          otlp: {
            enabled: true,
            port: 4318
          }
        }
      });
      responseQueue.push({ statusCode: 200, body: '{"ignored":true}' });

      agentConnection.sendMetrics({ resourceMetrics: [] }, (err, body) => {
        expect(err).to.not.exist;
        expect(body).to.deep.equal([]);
        expect(requests).to.have.lengthOf(1);
        expect(requests[0].options).to.include({
          host: '127.0.0.1',
          port: 4318,
          path: '/v1/metrics',
          method: 'POST'
        });
        expect(requests[0].options.headers['Content-Type']).to.equal('application/json; charset=UTF-8');
        expect(JSON.parse(requests[0].payload.toString())).to.deep.equal({ resourceMetrics: [] });
        done();
      });
    });

    it('should log OTLP metrics errors and forward the error to the callback', done => {
      initAgentConnection({
        tracing: {
          otlp: {
            enabled: true,
            port: 4318
          }
        }
      });

      const requestError = new Error('socket hang up');
      httpRequestStub.callsFake((options, responseCallback) => {
        const req = new ExportRequestEmitter();
        req.options = options;
        req.responseCallback = responseCallback;
        req.autoError = requestError;
        requests.push(req);
        return req;
      });

      agentConnection.sendMetrics({ resourceMetrics: [] }, (err, body) => {
        expect(err).to.exist;
        expect(body).to.equal(null);
        expect(err.message).to.equal('Send data to agent via POST /v1/metrics. Request failed: socket hang up');
        expect(logger.error).to.have.been.calledOnce;
        expect(logger.error.firstCall.args[0]).to.equal('Error sending metrics:');
        expect(logger.error.firstCall.args[1]).to.equal(err);
        done();
      });
    });

    it('should not log legacy metrics errors when OTLP export is disabled', done => {
      initAgentConnection({
        tracing: {
          otlp: {
            enabled: false,
            port: 4318
          }
        }
      });

      const requestError = new Error('socket hang up');
      httpRequestStub.callsFake((options, responseCallback) => {
        const req = new ExportRequestEmitter();
        req.options = options;
        req.responseCallback = responseCallback;
        req.autoError = requestError;
        requests.push(req);
        return req;
      });

      agentConnection.sendMetrics({ m: 1 }, err => {
        expect(err).to.exist;
        expect(err.message).to.equal(
          'Send data to agent via POST /com.instana.plugin.nodejs.4711. Request failed: socket hang up'
        );
        expect(logger.error).to.not.have.been.called;
        done();
      });
    });

    it('should forward non-2xx OTLP metrics responses as errors', done => {
      initAgentConnection({
        tracing: {
          otlp: {
            enabled: true,
            port: 4318
          }
        }
      });
      responseQueue.push({ statusCode: 500, body: 'boom' });

      agentConnection.sendMetrics({ resourceMetrics: [] }, (err, body) => {
        expect(err).to.exist;
        expect(body).to.equal(null);
        expect(err.message).to.equal('Failed to send data to agent via POST /v1/metrics. Got status code 500.');
        expect(logger.error).to.have.been.calledOnce;
        done();
      });
    });

    it('should use the configured OTLP port for metrics requests', done => {
      initAgentConnection({
        tracing: {
          otlp: {
            enabled: true,
            port: 9999
          }
        }
      });
      responseQueue.push({ statusCode: 200, body: '' });

      agentConnection.sendMetrics({ resourceMetrics: [] }, err => {
        expect(err).to.not.exist;
        expect(requests[0].options.port).to.equal(9999);
        expect(requests[0].options.path).to.equal('/v1/metrics');
        done();
      });
    });
  });
});
