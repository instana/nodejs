/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const backendConnector = require('../src/backend_connector');
const uninstrumentedHttp = require('../src/uninstrumentedHttp');
const testConfig = require('../../core/test/config');
const delay = require('../../core/test/test_util/delay');
const retry = require('../../core/test/test_util/retry');
const { createFakeLogger } = require('../../core/test/test_util');
const environmentUtil = require('../src/environment');

const sendBundle = async () => {
  return new Promise(resolve => {
    backendConnector.sendBundle({}, true, () => {
      resolve();
    });
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

      backendConnector.init({ config, stopSendingOnFailure: false, useLambdaExtension: true });

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

    it('when lambda extension is used & heartbeat is working, but error when talking to extension', async () => {
      expect(global.clearInterval.called).to.be.false;

      backendConnector.init({ config, useLambdaExtension: true });

      expect(uninstrumentedHttp.http.request.called).to.be.true;
      expect(uninstrumentedHttp.http.request.callCount).to.eql(1);

      return retry(async () => {
        const prom = sendBundle();
        await delay(200);

        const onError = onceStub.getCalls().find(call => call.firstArg === 'error').callback;
        const onEnd = uninstrumentedHttp.http.request
          .getCalls()
          .find(call => call.firstArg.path === '/bundle').callback;

        onError();
        expect(global.clearInterval.called).to.be.true;

        setTimeout(onEnd, 200);
        await prom;

        expect(destroyStub.called).to.be.true;
      });
    });

    it('when lambda extension is used & heartbeat is working & send once', async () => {
      backendConnector.init({ config, useLambdaExtension: true });

      expect(uninstrumentedHttp.http.request.called).to.be.true;
      expect(uninstrumentedHttp.http.request.callCount).to.eql(1);

      await delay(550);

      expect(uninstrumentedHttp.http.request.called).to.be.true;
      expect(uninstrumentedHttp.http.request.callCount).to.eql(2);

      expect(global.setInterval.called).to.be.true;
      expect(global.setInterval.calledOnce).to.be.true;

      return retry(async () => {
        const prom = sendBundle();
        await delay(200);

        const onceFinish = onceStub.getCalls().find(call => call.firstArg === 'finish').callback;
        const onFinish = onStub.getCalls().find(call => call.firstArg === 'finish').callback;
        const onEnd = uninstrumentedHttp.http.request
          .getCalls()
          .find(call => call.firstArg.path === '/bundle').callback;

        onceFinish();

        setTimeout(onEnd, 250);
        setTimeout(onFinish, 200);

        await prom;

        // 1 bundle req, 2 heartbeats
        expect(uninstrumentedHttp.http.request.callCount).to.eql(3);

        // finalLambdaRequest == true, we expect the heartbeat to finish
        expect(global.clearInterval.called).to.be.true;

        await delay(250);

        // 1 bundle req, 2 heartbeats
        expect(uninstrumentedHttp.http.request.callCount).to.eql(3);

        expect(destroyStub.called).to.be.true;
      });
    });

    it('when lambda extension is used & heartbeat is working & more data is incoming', async () => {
      backendConnector.init({ config, useLambdaExtension: true });

      expect(uninstrumentedHttp.http.request.called).to.be.true;
      expect(uninstrumentedHttp.http.request.callCount).to.eql(1);

      await delay(550);

      expect(uninstrumentedHttp.http.request.called).to.be.true;
      expect(uninstrumentedHttp.http.request.callCount).to.eql(2);

      expect(global.setInterval.called).to.be.true;
      expect(global.setInterval.calledOnce).to.be.true;

      return retry(async () => {
        let prom = sendSpans();
        await delay(200);

        let onFinish = onStub.getCalls().find(call => call.firstArg === 'finish').callback;
        let onEnd = uninstrumentedHttp.http.request.getCalls().find(call => call.firstArg.path === '/traces').callback;

        setTimeout(onEnd, 250);
        setTimeout(onFinish, 200);

        await prom;

        expect(uninstrumentedHttp.http.request.callCount).to.eql(4);

        // finalLambdaRequest == false, we expect the heartbeat to NOT finish
        expect(global.clearInterval.called).to.be.false;

        await delay(800);

        // more heartbeats
        expect(uninstrumentedHttp.http.request.callCount).to.eql(5);

        onStub.resetHistory();
        uninstrumentedHttp.http.request.resetHistory();

        prom = sendBundle();
        await delay(200);

        onFinish = onStub.getCalls().find(call => call.firstArg === 'finish').callback;
        onEnd = uninstrumentedHttp.http.request.getCalls().find(call => call.firstArg.path === '/bundle').callback;

        setTimeout(onEnd, 250);
        setTimeout(onFinish, 200);

        await prom;

        expect(uninstrumentedHttp.http.request.callCount).to.eql(2);

        // finalLambdaRequest is now true, we expect the heartbeat to finish
        expect(global.clearInterval.called).to.be.true;

        await delay(250);

        expect(uninstrumentedHttp.http.request.callCount).to.eql(2);

        expect(destroyStub.called).to.be.true;
      });
    });
  });

  describe('Backend URL handling', function () {
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
});
