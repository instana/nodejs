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

const { tracing } = require('@instana/core');

const agentConnection = require('../../src/agentConnection');
const initializedTooLate = require('../../src/util/initializedTooLate');
const metrics = require('../../src/metrics');
const requestHandler = require('../../src/agent/requestHandler');
const transmissionCycle = require('../../src/metrics/transmissionCycle');
const uncaught = require('../../src/uncaught');
const eol = require('../../src/util/eol');

describe('agent ready state', () => {
  let agentreadyState;

  let agentOptsStub;
  let tracingStub;
  let agentConnectionStub;
  let initializedTooLateStub;
  let metricsStub;
  let requestHandlerStub;
  let transmissionCycleStub;
  let uncaughtStub;
  let eolStub;

  describe('enter', () => {
    before(() => {
      agentOptsStub = {
        config: {}
      };
      tracingStub = sinon.stub(tracing);
      agentConnectionStub = sinon.stub(agentConnection);
      initializedTooLateStub = sinon.stub(initializedTooLate);
      metricsStub = sinon.stub(metrics);
      requestHandlerStub = sinon.stub(requestHandler);
      transmissionCycleStub = sinon.stub(transmissionCycle);
      uncaughtStub = sinon.stub(uncaught);
      eolStub = sinon.stub(eol);

      agentreadyState = proxyquire('../../src/announceCycle/agentready', {
        '@instana/core': {
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
    });

    afterEach(() => {
      initializedTooLateStub.check.reset();
      uncaughtStub.activate.reset();
      metricsStub.activate.reset();
      requestHandlerStub.activate.reset();
      transmissionCycleStub.activate.reset();
      tracingStub.activate.reset();
      agentOptsStub.config = {};
    });

    after(() => {
      sinon.restore();
      agentreadyState.leave();
    });

    it('should activate all components', () => {
      agentreadyState.enter();
      expect(initializedTooLateStub.check).to.have.been.called;
      expect(uncaughtStub.activate).to.have.been.called;
      expect(metricsStub.activate).to.have.been.called;
      expect(requestHandlerStub.activate).to.have.been.called;
      expect(transmissionCycleStub.activate).to.have.been.called;
      expect(tracingStub.activate).to.have.been.called;
    });

    it('should forward agent config to tracing component', () => {
      agentOptsStub.config = { foo: { bar: 'baz' } };
      agentreadyState.enter();
      expect(tracingStub.activate).to.have.been.calledWith(agentOptsStub.config);
    });
  });
});
