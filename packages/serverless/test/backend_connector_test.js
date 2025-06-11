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
});
