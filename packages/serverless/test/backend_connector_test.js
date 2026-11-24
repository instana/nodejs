/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const backendConnector = require('../src/backend_connector');
const uninstrumentedHttp = require('../src/uninstrumentedHttp');
const testConfig = require('@_local/core/test/config');
const delay = require('@_local/core/test/test_util/delay');
const retry = require('@_local/core/test/test_util/retry');
const { createFakeLogger } = require('@_local/core/test/test_util');
const environmentUtil = require('../src/environment');

const sendBundle = async () => {
  return new Promise((resolve, reject) => {
    try {
      backendConnector.sendBundle({}, true, () => {
        resolve();
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log(e);
      reject(e);
    }
  });
};
const sendSpans = async () => {
  return new Promise(resolve => {
    backendConnector.sendSpans({}, () => {
      resolve();
    });
  });
};

describe('[UNIT] backend connector', () => {
  const config = { logger: createFakeLogger() };

  describe('Lambda Heartbeat', function () {
    this.timeout(testConfig.getTestTimeout());

    before(() => {
      environmentUtil.setInstanaAgentKey('fake-key');
    });

    let onStub;
    let onceStub;
    let destroyStub;
    let setTimeoutStub;

    beforeEach(() => {
      sinon.spy(global, 'setInterval');
      sinon.spy(global, 'clearInterval');

      onStub = sinon.stub();
      onceStub = sinon.stub();
      destroyStub = sinon.stub();
      setTimeoutStub = sinon.stub();

      sinon.stub(uninstrumentedHttp.http, 'request').returns({
        on: onStub,
        once: onceStub,
        setTimeout: setTimeoutStub,
        end: sinon.stub(),
        removeAllListeners: sinon.stub(),
        destroy: destroyStub
      });
    });

    afterEach(() => {
      sinon.restore();
    });

    it('when lambda extension is not used', async () => {
      backendConnector.init({ config });

      expect(uninstrumentedHttp.http.request.called).to.be.false;
      await delay(750);
      expect(uninstrumentedHttp.http.request.called).to.be.false;
      expect(global.setInterval.called).to.be.false;
      expect(global.clearInterval.called).to.be.false;
    });

    it('when lambda extension is used & heartbeat is not working', async () => {
      expect(global.clearInterval.called).to.be.false;

      backendConnector.init({ config, useLambdaExtension: true });

      expect(uninstrumentedHttp.http.request.called).to.be.true;
      expect(uninstrumentedHttp.http.request.callCount).to.eql(1);

      const onError = onceStub.getCalls().find(call => call.firstArg === 'error').callback;
      onError();

      expect(global.clearInterval.called).to.be.true;
    });

    it('when lambda extension is used & heartbeat is working, but timeout when talking to extension', async () => {
      expect(global.clearInterval.called).to.be.false;

      backendConnector.init({ config, useLambdaExtension: true });

      expect(uninstrumentedHttp.http.request.called).to.be.true;
      expect(uninstrumentedHttp.http.request.callCount).to.eql(1);

      expect(setTimeoutStub.called).to.be.true;
      expect(destroyStub.called).to.be.false;

      const firstCallArgs = setTimeoutStub.getCall(0).args;

      await delay(200);

      // simulate timeout of extension
      firstCallArgs[1]();

      return retry(async () => {
        expect(destroyStub.called).to.be.true;

        const prom = sendBundle();
        await delay(200);
        await prom;

        expect(destroyStub.called).to.be.true;
      });
    });

    // eslint-disable-next-line max-len
    it('when lambda extension is used & heartbeat is working, but error when sending bundle (retries) with no final success', cb => {
      expect(global.clearInterval.called).to.be.false;

      backendConnector.init({ config, useLambdaExtension: true });

      expect(uninstrumentedHttp.http.request.called).to.be.true;
      expect(uninstrumentedHttp.http.request.callCount).to.eql(1);

      const myinterval = setInterval(() => {
        const onError = onStub.getCalls().find(call => call.firstArg === 'error');
        const heartbeatOnEnd = uninstrumentedHttp.http.request
          .getCalls()
          .find(call => call.firstArg.path === '/heartbeat');

        onStub.resetHistory();
        uninstrumentedHttp.http.request.resetHistory();

        heartbeatOnEnd.callback({ once: sinon.stub(), on: sinon.stub() });

        if (!onError || !onError.callback) {
          return;
        }

        onError.callback();
      }, 500);

      backendConnector.sendBundle({}, true, () => {
        clearInterval(myinterval);
        expect(global.clearInterval.called).to.be.true;
        expect(destroyStub.called).to.be.true;
        cb();
      });
    });

    // eslint-disable-next-line max-len
    it('when lambda extension is used & heartbeat is working, but error when sending bundle (retries) with final success', cb => {
      expect(global.clearInterval.called).to.be.false;

      backendConnector.init({ config, useLambdaExtension: true });

      expect(uninstrumentedHttp.http.request.called).to.be.true;
      expect(uninstrumentedHttp.http.request.callCount).to.eql(1);

      let onErrorReturned = false;
      const myinterval = setInterval(() => {
        const onError = onStub.getCalls().find(call => call.firstArg === 'error');
        const onEnd = uninstrumentedHttp.http.request.getCalls().find(call => call.firstArg.path === '/bundle');
        const onFinish = onStub.getCalls().find(call => call.firstArg === 'finish');
        const heartbeatOnEnd = uninstrumentedHttp.http.request
          .getCalls()
          .find(call => call.firstArg.path === '/heartbeat');

        onStub.resetHistory();
        uninstrumentedHttp.http.request.resetHistory();

        heartbeatOnEnd.callback({ once: sinon.stub(), on: sinon.stub() });

        if (!onError || !onEnd || !onError.callback || !onEnd.callback) {
          return;
        }

        if (onErrorReturned) {
          onFinish.callback();
          return onEnd.callback();
        }

        onErrorReturned = true;
        onError.callback();
      }, 500);

      backendConnector.sendBundle({}, true, () => {
        clearInterval(myinterval);
        expect(global.clearInterval.called).to.be.true;
        expect(destroyStub.called).to.be.true;
        cb();
      });
    });

    it('when lambda extension is used & heartbeat is working & send once', async () => {
      backendConnector.init({ config, useLambdaExtension: true });

      let heartbeatCallback = uninstrumentedHttp.http.request
        .getCalls()
        .find(call => call.firstArg.path === '/heartbeat').callback;

      let heartbeatOnceEndStub = sinon.stub();
      heartbeatCallback({ once: heartbeatOnceEndStub, on: sinon.stub(), statusCode: 200 });
      let heartbeatOnEnd = heartbeatOnceEndStub.getCalls().find(call => call.firstArg === 'end').callback;
      heartbeatOnEnd();

      expect(uninstrumentedHttp.http.request.called).to.be.true;
      expect(uninstrumentedHttp.http.request.callCount).to.eql(1);

      // wait for the interval
      await delay(400);

      heartbeatOnceEndStub = sinon.stub();
      heartbeatCallback = uninstrumentedHttp.http.request
        .getCalls()
        .find(call => call.firstArg.path === '/heartbeat').callback;

      heartbeatCallback({ once: heartbeatOnceEndStub, on: sinon.stub(), statusCode: 200 });

      heartbeatOnEnd = heartbeatOnceEndStub.getCalls().find(call => call.firstArg === 'end').callback;
      heartbeatOnEnd();

      expect(uninstrumentedHttp.http.request.called).to.be.true;
      expect(uninstrumentedHttp.http.request.callCount).to.eql(2);

      expect(global.setInterval.called).to.be.true;
      expect(global.setInterval.calledOnce).to.be.true;

      const prom = sendBundle();
      await delay(200);

      const onFinish = onStub.getCalls().find(call => call.firstArg === 'finish').callback;
      const onEnd = uninstrumentedHttp.http.request.getCalls().find(call => call.firstArg.path === '/bundle').callback;

      setTimeout(onFinish, 200);
      setTimeout(onEnd, 250);

      await prom;

      // 1 bundle req, 3 heartbeats
      expect(uninstrumentedHttp.http.request.callCount).to.eql(4);

      // finalLambdaRequest == true, we expect the heartbeat to finish
      expect(global.clearInterval.called).to.be.true;

      await delay(250);

      // 1 bundle req, 4 heartbeats = proof that heartbeat is dead
      expect(uninstrumentedHttp.http.request.callCount).to.eql(4);

      heartbeatOnceEndStub = sinon.stub();
      heartbeatCallback = uninstrumentedHttp.http.request
        .getCalls()
        .find(call => call.firstArg.path === '/heartbeat').callback;

      heartbeatCallback({ once: heartbeatOnceEndStub, on: sinon.stub(), statusCode: 200 });

      heartbeatOnEnd = heartbeatOnceEndStub.getCalls().find(call => call.firstArg === 'end').callback;
      heartbeatOnEnd();

      // Destroy will only be called manually for timeouts
      expect(destroyStub.called).to.be.false;
    });

    it('when lambda extension is used & heartbeat is working & more data is incoming', async () => {
      backendConnector.init({ config, useLambdaExtension: true });

      let heartbeatCallback = uninstrumentedHttp.http.request
        .getCalls()
        .find(call => call.firstArg.path === '/heartbeat').callback;

      let heartbeatOnceEndStub = sinon.stub();
      heartbeatCallback({ once: heartbeatOnceEndStub, on: sinon.stub(), statusCode: 200 });
      let heartbeatOnEnd = heartbeatOnceEndStub.getCalls().find(call => call.firstArg === 'end').callback;
      heartbeatOnEnd();

      expect(uninstrumentedHttp.http.request.called).to.be.true;
      expect(uninstrumentedHttp.http.request.callCount).to.eql(1);

      await delay(550);

      heartbeatCallback = uninstrumentedHttp.http.request
        .getCalls()
        .find(call => call.firstArg.path === '/heartbeat').callback;

      heartbeatOnceEndStub = sinon.stub();
      heartbeatCallback({ once: heartbeatOnceEndStub, on: sinon.stub(), statusCode: 200 });
      heartbeatOnEnd = heartbeatOnceEndStub.getCalls().find(call => call.firstArg === 'end').callback;
      heartbeatOnEnd();

      expect(uninstrumentedHttp.http.request.called).to.be.true;
      expect(uninstrumentedHttp.http.request.callCount).to.eql(2);

      expect(global.setInterval.called).to.be.true;
      expect(global.setInterval.calledOnce).to.be.true;

      let prom = sendSpans();
      await delay(200);

      let onFinish = onStub.getCalls().find(call => call.firstArg === 'finish').callback;
      let onEnd = uninstrumentedHttp.http.request.getCalls().find(call => call.firstArg.path === '/traces').callback;

      setTimeout(onEnd, 250);
      setTimeout(onFinish, 200);

      await prom;

      expect(uninstrumentedHttp.http.request.callCount).to.be.greaterThan(3);

      // finalLambdaRequest == false, we expect the heartbeat to NOT finish
      expect(global.clearInterval.called).to.be.false;

      heartbeatCallback = uninstrumentedHttp.http.request
        .getCalls()
        .find(call => call.firstArg.path === '/heartbeat').callback;

      heartbeatOnceEndStub = sinon.stub();
      heartbeatCallback({ once: heartbeatOnceEndStub, on: sinon.stub(), statusCode: 200 });
      heartbeatOnEnd = heartbeatOnceEndStub.getCalls().find(call => call.firstArg === 'end').callback;
      heartbeatOnEnd();

      await delay(500);

      heartbeatCallback = uninstrumentedHttp.http.request
        .getCalls()
        .find(call => call.firstArg.path === '/heartbeat').callback;

      heartbeatOnceEndStub = sinon.stub();
      heartbeatCallback({ once: heartbeatOnceEndStub, on: sinon.stub(), statusCode: 200 });
      heartbeatOnEnd = heartbeatOnceEndStub.getCalls().find(call => call.firstArg === 'end').callback;
      heartbeatOnEnd();

      // more heartbeats
      expect(uninstrumentedHttp.http.request.callCount).to.be.greaterThan(4);

      onStub.resetHistory();
      uninstrumentedHttp.http.request.resetHistory();

      prom = sendBundle();
      await delay(200);

      onFinish = onStub.getCalls().find(call => call.firstArg === 'finish').callback;
      onEnd = uninstrumentedHttp.http.request.getCalls().find(call => call.firstArg.path === '/bundle').callback;

      setTimeout(onEnd, 250);
      setTimeout(onFinish, 200);

      await prom;

      const rememberCount = uninstrumentedHttp.http.request.callCount;
      expect(uninstrumentedHttp.http.request.callCount).to.be.greaterThan(1);

      // finalLambdaRequest is now true, we expect the heartbeat to finish
      expect(global.clearInterval.called).to.be.true;

      await delay(250);

      // It stopped.
      expect(uninstrumentedHttp.http.request.callCount).to.eql(rememberCount);

      expect(destroyStub.called).to.be.false;
    });
  });

  describe('Agent Url cases', function () {
    this.timeout(testConfig.getTestTimeout());

    let requestStub;
    let fakeRequest;
    let onStub;
    let endStub;

    beforeEach(() => {
      onStub = sinon.stub();
      endStub = sinon.stub();

      fakeRequest = {
        on: onStub,
        end: endStub,
        setTimeout: sinon.stub(),
        once: sinon.stub(),
        removeAllListeners: sinon.stub(),
        destroy: sinon.stub()
      };

      requestStub = sinon.stub().returns(fakeRequest);
      sinon.stub(uninstrumentedHttp, 'https').value({ request: requestStub });
      sinon.stub(environmentUtil, 'getBackendHost').returns('example.com');
      sinon.stub(environmentUtil, 'getInstanaAgentKey').returns('fake key');

      backendConnector.init({ config });
    });

    afterEach(() => {
      sinon.restore();
    });

    it('should correctly handle root path with trailing slash (/) for bundle endpoint', async () => {
      sinon.stub(environmentUtil, 'getBackendPath').returns('/');

      sendBundle();

      await delay(100);

      const reqOptions = requestStub.getCall(0).args[0];
      expect(reqOptions.path).to.equal('/bundle');
      expect(reqOptions.path).to.not.include('//');
    });

    it('should correctly handle root path without trailing slash for traces endpoint', async () => {
      sinon.stub(environmentUtil, 'getBackendPath').returns('/');

      sendSpans();

      await delay(100);

      const reqOptions = requestStub.getCall(0).args[0];
      expect(reqOptions.path).to.equal('/traces');
      expect(reqOptions.path).to.not.include('//');
    });
  });

  describe('export target with url', function () {
    this.timeout(testConfig.getTestTimeout());

    let httpRequestStub;
    let httpsRequestStub;
    let fakeRequest;
    let handlers;
    let target;

    const payload = { resourceSpans: [] };

    beforeEach(() => {
      handlers = {};
      fakeRequest = {
        on: (event, fn) => {
          handlers[event] = fn;
          return fakeRequest;
        },
        end: sinon.stub(),
        once: sinon.stub(),
        removeAllListeners: sinon.stub(),
        destroy: sinon.stub(),
        destroyed: false
      };

      httpRequestStub = sinon.stub().returns(fakeRequest);
      httpsRequestStub = sinon.stub().returns(fakeRequest);
      sinon.stub(uninstrumentedHttp, 'http').value({ request: httpRequestStub });
      sinon.stub(uninstrumentedHttp, 'https').value({ request: httpsRequestStub });
      sinon.stub(environmentUtil, 'getBackendHost').returns('acceptor.example.com');
      sinon.stub(environmentUtil, 'getBackendPath').returns('/');
      sinon.stub(environmentUtil, 'getInstanaAgentKey').returns('fake key');

      target = {
        path: '/v1/traces',
        url: 'https://otlp.example.com:4318/prefix/v1/traces',
        headers: { 'x-api-key': 'k' }
      };
      backendConnector.init({ config });
    });

    afterEach(() => {
      sinon.restore();
    });

    it('should send spans to the url of the target with the configured headers', () => {
      backendConnector.sendSpans(payload, () => {}, target);

      expect(httpsRequestStub.calledOnce).to.be.true;
      const reqOptions = httpsRequestStub.getCall(0).args[0];
      expect(reqOptions.hostname).to.equal('otlp.example.com');
      expect(reqOptions.port).to.equal('4318');
      expect(reqOptions.path).to.equal('/prefix/v1/traces');
      expect(reqOptions.method).to.equal('POST');
      expect(reqOptions.headers['x-api-key']).to.equal('k');
      expect(reqOptions.headers['Content-Type']).to.equal('application/json');
      expect(fakeRequest.end.calledWith(JSON.stringify(payload))).to.be.true;
    });

    it('should not send the Instana agent key to the target url', () => {
      backendConnector.sendSpans(payload, () => {}, target);

      const reqOptions = httpsRequestStub.getCall(0).args[0];
      expect(Object.keys(reqOptions.headers).map(h => h.toLowerCase())).to.not.include('x-instana-key');
    });

    it('should send logs to the url of the target', () => {
      target.url = 'https://otlp.example.com:4318/prefix/v1/logs';
      backendConnector.sendLogs(payload, () => {}, target);

      expect(httpsRequestStub.getCall(0).args[0].path).to.equal('/prefix/v1/logs');
    });

    it('should use plain http for an http url and default the port', () => {
      target.url = 'http://localhost/v1/logs';
      backendConnector.sendLogs(payload, () => {}, target);

      expect(httpsRequestStub.called).to.be.false;
      const reqOptions = httpRequestStub.getCall(0).args[0];
      expect(reqOptions.port).to.equal(80);
      expect(reqOptions.path).to.equal('/v1/logs');
    });

    it('should call back without error for a 2xx response', done => {
      backendConnector.sendSpans(
        payload,
        err => {
          expect(err).to.not.exist;
          done();
        },
        target
      );
      handlers.response({ statusCode: 200, resume: sinon.stub() });
    });

    it('should call back with an error for a non-2xx response', done => {
      backendConnector.sendSpans(
        payload,
        err => {
          expect(err.message).to.include('503');
          done();
        },
        target
      );
      handlers.response({ statusCode: 503, resume: sinon.stub() });
    });

    it('should call back with an error if the request fails', done => {
      backendConnector.sendLogs(
        payload,
        err => {
          expect(err.message).to.equal('boom');
          done();
        },
        target
      );
      handlers.error(new Error('boom'));
    });

    it('should call back with an error and destroy the request on timeout', done => {
      backendConnector.sendLogs(
        payload,
        err => {
          expect(err.message).to.include('Timeout');
          expect(fakeRequest.destroy.called).to.be.true;
          done();
        },
        target
      );
      handlers.timeout();
    });

    it('should call back only once', () => {
      const callback = sinon.spy();
      backendConnector.sendLogs(payload, callback, target);
      handlers.error(new Error('boom'));
      handlers.timeout();

      expect(callback.calledOnce).to.be.true;
    });

    it('should call back with an error if the url is malformed', done => {
      target.url = 'not a url';
      backendConnector.sendSpans(
        payload,
        err => {
          expect(err).to.exist;
          expect(httpsRequestStub.called).to.be.false;
          done();
        },
        target
      );
    });

    it('should send spans to the serverless acceptor if the target has no url', () => {
      delete target.url;
      backendConnector.sendSpans(payload, () => {}, target);

      expect(httpsRequestStub.getCall(0).args[0].hostname).to.equal('acceptor.example.com');
      expect(httpsRequestStub.getCall(0).args[0].path).to.equal('/traces');
    });

    it('should send spans to the serverless acceptor if there is no target', () => {
      backendConnector.sendSpans(payload, () => {});

      expect(httpsRequestStub.getCall(0).args[0].hostname).to.equal('acceptor.example.com');
      expect(httpsRequestStub.getCall(0).args[0].path).to.equal('/traces');
    });

    it('should send logs to the serverless acceptor /logs if there is no target url', () => {
      backendConnector.sendLogs(payload, () => {});

      const reqOptions = httpsRequestStub.getCall(0).args[0];
      expect(reqOptions.hostname).to.equal('acceptor.example.com');
      expect(reqOptions.path).to.equal('/logs');
    });
  });

  describe('Agent Key cases', function () {
    this.timeout(testConfig.getTestTimeout());

    let requestStub;
    let fakeRequest;
    let onStub;
    let endStub;

    beforeEach(() => {
      onStub = sinon.stub();
      endStub = sinon.stub();

      fakeRequest = {
        on: onStub,
        end: endStub,
        setTimeout: sinon.stub(),
        once: sinon.stub(),
        removeAllListeners: sinon.stub(),
        destroy: sinon.stub()
      };

      requestStub = sinon.stub().returns(fakeRequest);
      sinon.stub(uninstrumentedHttp, 'https').value({ request: requestStub });
      sinon.stub(environmentUtil, 'getBackendHost').returns('example.com');
      sinon.stub(environmentUtil, 'getInstanaAgentKey').returns(null);
      backendConnector.init({ config });
    });

    afterEach(() => {
      sinon.restore();
    });

    it('should return error when agent key is not set', cb => {
      config.logger.warn = sinon.spy();

      backendConnector.sendSpans({}, err => {
        expect(err).to.not.exist;
        expect(config.logger.warn.calledOnce).to.be.true;
        expect(config.logger.warn.firstCall.args[0]).to.include(
          'No Instana agent key configured. Cannot send data to Instana.'
        );
        cb();
      });
    });
  });
});
