/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const chai = require('chai');
const proxyquire = require('proxyquire');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');

const { FakeRequestHandler, FakeRequest, FakeResponse } = require('../test_util/fake_http');

const { expect } = chai;
chai.use(sinonChai);

let agentHostLookupState;

describe('agent host lookup state', () => {
  const host = '10.9.8.7';
  const defaultGatewayIp = '10.11.12.13';
  const port = 12345;

  let fakeRequest;
  let sinonFakeTimers;

  const agentOptsMock = {
    '@noCallThru': true,
    host,
    port
  };

  const hostAndPort = { host, port };
  const defaultGatewayIpPort = { host: defaultGatewayIp, port };

  const configuredHostLookupOk = new FakeRequestHandler({
    when: hostAndPort,
    then: (req, cb) => cb(new FakeResponse(200))
  });

  const configuredHostLookupConnectionRefused = new FakeRequestHandler({
    when: hostAndPort,
    then: req => req.emit('error', new Error(`connect ECONNREFUSED ${host}:${port}`)),
    onlyOnce: true
  });

  const defaultGatewayLookupOk = new FakeRequestHandler({
    when: defaultGatewayIpPort,
    then: (req, cb) => cb(new FakeResponse(200))
  });

  const defaultGatewayLookupConnectionRefused = new FakeRequestHandler({
    when: defaultGatewayIpPort,
    then: req => req.emit('error', new Error(`connect ECONNREFUSED ${defaultGatewayIp}:${port}`)),
    onlyOnce: true
  });

  const requestStub = sinon.stub();
  const httpStub = {
    request: requestStub,
    '@noCallThru': true
  };

  const parseProcSelfNetRouteFileStub = sinon.stub();
  const defaultGatewayParserMock = {
    '@noCallThru': true,
    parseProcSelfNetRouteFile: parseProcSelfNetRouteFileStub
  };

  const transitionTo = sinon.stub();
  const ctxStub = { transitionTo };

  before(() => {
    agentHostLookupState = proxyquire('../../src/announceCycle/agentHostLookup', {
      '../agent/opts': agentOptsMock,
      '@instana/core': {
        uninstrumentedHttp: {
          http: httpStub
        }
      },

      './defaultGatewayParser': defaultGatewayParserMock
    });
  });

  afterEach(() => {
    sinon.restore();
    fakeRequest.reset();
    if (sinonFakeTimers) {
      sinonFakeTimers.restore();
    }
  });

  describe('via configured IP/configured port', () => {
    before(() => {
      requestStub.callsFake((opt, cb) => {
        fakeRequest = new FakeRequest([configuredHostLookupOk], opt, cb);
        return fakeRequest;
      });

      agentOptsMock.host = hostAndPort.host;
      agentOptsMock.port = hostAndPort.port;
    });

    it('should find the agent at the configured IP and port', done => {
      transitionTo.callsFake(newState => {
        expect(newState).to.equal('unannounced');
        expect(configuredHostLookupOk.hasBeenCalled()).to.be.true;
        done();
      });

      agentHostLookupState.enter(ctxStub);
    });
  });

  describe('via default gateway IP', () => {
    before(() => {
      agentOptsMock.host = hostAndPort.host;
      agentOptsMock.port = hostAndPort.port;
      parseProcSelfNetRouteFileStub.callsFake(async () => defaultGatewayIp);
      requestStub.callsFake((opt, cb) => {
        fakeRequest = new FakeRequest(
          [
            //
            configuredHostLookupConnectionRefused,
            defaultGatewayLookupOk
          ],
          opt,
          cb
        );
        return fakeRequest;
      });
    });

    it('should find the agent at the default gateway IP', done => {
      transitionTo.callsFake(newState => {
        expect(configuredHostLookupConnectionRefused.hasBeenCalled()).to.be.true;
        expect(parseProcSelfNetRouteFileStub).to.have.been.called;
        expect(defaultGatewayLookupOk.hasBeenCalled()).to.be.true;
        expect(newState).to.equal('unannounced');
        done();
      });

      agentHostLookupState.enter(ctxStub);
    });
  });

  describe('retry when default gateway IP cannot be determined', () => {
    before(() => {
      agentOptsMock.host = hostAndPort.host;
      agentOptsMock.port = hostAndPort.port;
      parseProcSelfNetRouteFileStub.callsFake(async () => {
        throw new Error('Failed to determine the default gateway: The file /proc/self/net/route does not exist');
      });
      requestStub.callsFake((opt, cb) => {
        fakeRequest = new FakeRequest([configuredHostLookupConnectionRefused, configuredHostLookupOk], opt, cb);
        return fakeRequest;
      });

      sinonFakeTimers = sinon.useFakeTimers();
    });

    it('should retry the configured host', async () =>
      // eslint-disable-next-line no-async-promise-executor
      new Promise(async (resolve, reject) => {
        transitionTo.callsFake(newState => {
          try {
            expect(newState).to.equal('unannounced');
            expect(configuredHostLookupConnectionRefused.hasBeenCalled()).to.be.true;
            expect(parseProcSelfNetRouteFileStub).to.have.been.called;
            expect(configuredHostLookupOk.hasBeenCalled()).to.be.true;
            resolve();
          } catch (e) {
            reject(e);
          }
        });
        agentHostLookupState.enter(ctxStub);
        await sinonFakeTimers.runAllAsync();
      }));
  });

  describe('retry when default gateway IP can be determined', () => {
    const configuredHostLookupConnectionRefusedSecondAttempt = configuredHostLookupConnectionRefused.clone();
    before(() => {
      agentOptsMock.host = hostAndPort.host;
      agentOptsMock.port = hostAndPort.port;
      parseProcSelfNetRouteFileStub.callsFake(async () => defaultGatewayIp);
      requestStub.callsFake((opt, cb) => {
        fakeRequest = new FakeRequest(
          [
            //
            configuredHostLookupConnectionRefused,
            defaultGatewayLookupConnectionRefused,
            configuredHostLookupConnectionRefusedSecondAttempt,
            defaultGatewayLookupOk
          ],
          opt,
          cb
        );
        return fakeRequest;
      });

      sinonFakeTimers = sinon.useFakeTimers();
    });

    it('should retry the configured host', async () =>
      // eslint-disable-next-line no-async-promise-executor
      new Promise(async (resolve, reject) => {
        transitionTo.callsFake(newState => {
          try {
            expect(newState).to.equal('unannounced');
            expect(configuredHostLookupConnectionRefused.hasBeenCalled()).to.be.true;
            expect(parseProcSelfNetRouteFileStub).to.have.been.called;
            expect(defaultGatewayLookupConnectionRefused.hasBeenCalled()).to.be.true;
            expect(configuredHostLookupConnectionRefusedSecondAttempt.hasBeenCalled()).to.be.true;
            expect(defaultGatewayLookupOk.hasBeenCalled()).to.be.true;

            resolve();
          } catch (e) {
            reject(e);
          }
        });
        agentHostLookupState.enter(ctxStub);

        await sinonFakeTimers.runAllAsync();
      }));
  });
});
