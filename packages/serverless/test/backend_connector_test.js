/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const backendConnector = require('../src/backend_connector');
const uninstrumentedHttp = require('../src/uninstrumentedHttp');
const delay = require('../../core/test/test_util/delay');

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
  describe('Lambda Heartbeat', function () {
    this.timeout(5 * 1000);

    let onStub;

    beforeEach(() => {
      sinon.spy(global, 'setInterval');
      sinon.spy(global, 'clearInterval');

      onStub = sinon.stub();

      sinon.stub(uninstrumentedHttp.http, 'request').returns({
        on: onStub,
        setTimeout: sinon.stub(),
        end: sinon.stub(),
        removeAllListeners: sinon.stub()
      });
    });

    afterEach(() => {
      sinon.restore();
    });

    it('when lambda extension is not used', async () => {
      backendConnector.init();

      expect(uninstrumentedHttp.http.request.called).to.be.false;
      await delay(750);
      expect(uninstrumentedHttp.http.request.called).to.be.false;
      expect(global.setInterval.called).to.be.false;
      expect(global.clearInterval.called).to.be.false;
    });

    it('when lambda extension is used & heartbeat is not working', async () => {
      expect(global.clearInterval.called).to.be.false;

      backendConnector.init(null, null, null, null, null, true);

      expect(uninstrumentedHttp.http.request.called).to.be.true;
      expect(uninstrumentedHttp.http.request.callCount).to.eql(1);

      const onError = onStub.getCalls().find(call => call.firstArg === 'error').callback;
      onError();

      expect(global.clearInterval.called).to.be.true;
    });

    it('when lambda extension is used & heartbeat is working, but timeout when talking to extension', async () => {
      expect(global.clearInterval.called).to.be.false;

      backendConnector.init(null, null, null, null, null, true);

      expect(uninstrumentedHttp.http.request.called).to.be.true;
      expect(uninstrumentedHttp.http.request.callCount).to.eql(1);

      const prom = sendBundle();
      await delay(200);

      const onTimeout = onStub.getCalls().find(call => call.firstArg === 'timeout').callback;
      const onEnd = uninstrumentedHttp.http.request.getCalls().find(call => call.firstArg.path === '/bundle').callback;

      onTimeout();
      expect(global.clearInterval.called).to.be.true;

      setTimeout(onEnd, 200);
      await prom;
    });

    it('when lambda extension is used & heartbeat is working, but error when talking to extension', async () => {
      expect(global.clearInterval.called).to.be.false;

      backendConnector.init(null, null, null, null, null, true);

      expect(uninstrumentedHttp.http.request.called).to.be.true;
      expect(uninstrumentedHttp.http.request.callCount).to.eql(1);

      const prom = sendBundle();
      await delay(200);

      const onError = onStub.getCalls().find(call => call.firstArg === 'error').callback;
      const onEnd = uninstrumentedHttp.http.request.getCalls().find(call => call.firstArg.path === '/bundle').callback;

      onError();
      expect(global.clearInterval.called).to.be.true;

      setTimeout(onEnd, 200);
      await prom;
    });

    it('when lambda extension is used & heartbeat is working & send once', async () => {
      backendConnector.init(null, null, null, null, null, true);

      expect(uninstrumentedHttp.http.request.called).to.be.true;
      expect(uninstrumentedHttp.http.request.callCount).to.eql(1);

      await delay(550);

      expect(uninstrumentedHttp.http.request.called).to.be.true;
      expect(uninstrumentedHttp.http.request.callCount).to.eql(2);

      expect(global.setInterval.called).to.be.true;
      expect(global.setInterval.calledOnce).to.be.true;

      const prom = sendBundle();
      await delay(200);

      const onFinish = onStub.getCalls().find(call => call.firstArg === 'finish').callback;
      const onEnd = uninstrumentedHttp.http.request.getCalls().find(call => call.firstArg.path === '/bundle').callback;

      setTimeout(onEnd, 250);
      setTimeout(onFinish, 200);

      await prom;

      // 1 bundle req, 2 heartbeats
      expect(uninstrumentedHttp.http.request.callCount).to.eql(3);

      // finalLambdaRequest == true, we expect the heartbeat to finish
      expect(global.clearInterval.called).to.be.true;

      await delay(1000);

      // 1 bundle req, 2 heartbeats
      expect(uninstrumentedHttp.http.request.callCount).to.eql(3);
    });

    it('when lambda extension is used & heartbeat is working & more data is incoming', async () => {
      backendConnector.init(null, null, null, null, null, true);

      expect(uninstrumentedHttp.http.request.called).to.be.true;
      expect(uninstrumentedHttp.http.request.callCount).to.eql(1);

      await delay(550);

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

      await delay(1000);

      expect(uninstrumentedHttp.http.request.callCount).to.eql(2);
    });
  });
});
