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

const { tracing } = require('@_local/core');
const testUtils = require('@_local/core/test/test_util');
const agentConnection = require('../../src/agentConnection');
const initializedTooLate = require('../../src/util/initializedTooLate');
const metrics = require('../../src/metrics');
const requestHandler = require('../../src/agent/requestHandler');
const transmissionCycle = require('../../src/metrics/transmissionCycle');
const uncaught = require('../../src/uncaught');
const eol = require('../../src/util/eol');

describe('agent ready state', () => {
  let agentReadyState;

  let agentOptsStub;
  let tracingStub;
  let agentConnectionStub;
  let initializedTooLateStub;
  let metricsStub;
  let requestHandlerStub;
  let transmissionCycleStub;
  let uncaughtStub;
  let eolStub;
  beforeEach(() => {
    agentOptsStub = {
      config: {},
      agentUuid: 'test-uuid'
    };
    tracingStub = sinon.stub(tracing);
    agentConnectionStub = sinon.stub(agentConnection);
    initializedTooLateStub = sinon.stub(initializedTooLate);
    metricsStub = sinon.stub(metrics);
    requestHandlerStub = sinon.stub(requestHandler);
    transmissionCycleStub = sinon.stub(transmissionCycle);
    uncaughtStub = sinon.stub(uncaught);
    eolStub = sinon.stub(eol);

    agentReadyState = proxyquire('../../src/announceCycle/agentready', {
      '@_local/core': {
        tracing: tracingStub
      },
      '../agent/opts': agentOptsStub,
      '../agentConnection': agentConnectionStub,
      '../util/initializedTooLate': initializedTooLateStub,
      '../metrics': metricsStub,
      '../agent/requestHandler': requestHandlerStub,
      '../metrics/transmissionCycle': transmissionCycleStub,
      '../uncaught': uncaughtStub,
      '../util/eol': eolStub
    });

    agentReadyState.init(
      { logger: testUtils.createFakeLogger() },
      {
        pid: 12345,
        getEntityId: () => 'test-entity-id'
      }
    );
  });

  afterEach(() => {
    sinon.restore();
    agentReadyState.leave();
  });

  describe('enter', () => {
    it('should activate all components', () => {
      agentReadyState.enter();
      expect(initializedTooLateStub.check).to.have.been.called;
      expect(uncaughtStub.activate).to.have.been.called;
      expect(metricsStub.activate).to.have.been.called;
      expect(requestHandlerStub.activate).to.have.been.called;
      expect(transmissionCycleStub.activate).to.have.been.called;
      expect(tracingStub.activate).to.have.been.called;
    });

    it('should forward agent config to tracing component', () => {
      agentOptsStub.config = { foo: { bar: 'baz' } };
      agentReadyState.enter();
      expect(tracingStub.activate).to.have.been.calledWith(agentOptsStub.config);
    });
  });

  describe('EOL event handling', () => {
    let clock;

    beforeEach(() => {
      clock = sinon.useFakeTimers();
      agentConnectionStub.sendEvent = sinon.stub();
      agentConnectionStub.AgentEventSeverity = agentConnection.AgentEventSeverity;
    });

    afterEach(() => {
      clock.restore();
    });

    it('should send EOL event when Node version is EOL', () => {
      eolStub.isNodeVersionEOL.returns(true);
      agentReadyState.enter();

      clock.tick(2001);

      expect(agentConnectionStub.sendEvent).to.have.been.calledOnce;
      const event = agentConnectionStub.sendEvent.firstCall.args[0];
      expect(event.title).to.include('Node.js version');
      expect(event.text).to.include('Please consider upgrading Node.js');
      expect(event.severity).to.equal(agentConnection.AgentEventSeverity.WARNING);
    });

    it('should not send EOL event when disabled in config', () => {
      agentReadyState.init(
        {
          logger: testUtils.createFakeLogger(),
          tracing: { disableEOLEvents: true }
        },
        { pid: 123, getEntityId: () => 'test-id' }
      );

      eolStub.isNodeVersionEOL.returns(true);
      agentReadyState.enter({ transitionTo: sinon.stub() });

      clock.tick(2001);

      expect(agentConnectionStub.sendEvent).not.to.have.been.called;
    });

    it('should not send EOL event when Node version is not EOL', () => {
      eolStub.isNodeVersionEOL.returns(false);
      agentReadyState.enter({ transitionTo: sinon.stub() });

      clock.tick(2001);

      expect(agentConnectionStub.sendEvent).not.to.have.been.called;
    });

    it('should schedule periodic EOL events', () => {
      eolStub.isNodeVersionEOL.returns(true);
      agentReadyState.enter({ transitionTo: sinon.stub() });

      clock.tick(2001);
      expect(agentConnectionStub.sendEvent).to.have.been.calledOnce;

      clock.tick(6 * 60 * 60 * 1000);
      expect(agentConnectionStub.sendEvent).to.have.been.calledTwice;
    });
  });
});
