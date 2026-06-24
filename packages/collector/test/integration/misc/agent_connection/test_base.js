/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const expect = require('chai').expect;

const constants = require('@_local/core').tracing.constants;
const testConfig = require('@_local/core/test/config');
const testUtils = require('@_local/core/test/test_util');

const dummyEntry = {
  n: 'dummy.entry',
  t: 'trace-id',
  s: 'entry-span-id',
  k: constants.ENTRY,
  data: {
    whatever: {
      value: 42
    }
  }
};
const dummyExit = {
  n: 'span.exit',
  t: 'trace-id',
  p: 'entry-span-id',
  s: 'exit-span-id',
  k: constants.ENTRY,
  data: {
    whatever: {
      value: 42
    }
  }
};

const dummySpans = [dummyExit, dummyEntry];

const circularData = { value: 1302 };
circularData.circular = circularData;

const circularSpan = {
  n: 'span.exit',
  t: 'trace-id',
  p: 'entry-span-id',
  s: 'exit-span-id',
  k: constants.ENTRY,
  data: {
    c: circularData
  }
};

const dummySpansWithCircularReference = [dummyExit, circularSpan, dummyEntry];

module.exports = function () {
  this.timeout(testConfig.getTestTimeout());

  const { AgentStubControls } = require('@_local/collector/test/apps/agentStubControls');
  const agentControls = new AgentStubControls();

  const agentOpts = require('@_local/collector/src/agent/opts');
  const originalPort = agentOpts.port;

  const config = { logger: testUtils.createFakeLogger() };
  const pidStore = require('@_local/collector/src/pidStore');
  let agentConnection;

  before(async () => {
    await agentControls.startAgent();
  });
  after(async () => {
    await agentControls.stopAgent();
  });

  beforeEach(async () => {
    agentOpts.port = agentControls.getPort();
    agentConnection = require('@_local/collector/src/agentConnection');
    pidStore.init(config);
    agentConnection.init(config, pidStore);

    await agentControls.simulateDiscovery(process.pid);
    await agentControls.clearReceivedData();
  });

  afterEach(() => {
    agentOpts.port = originalPort;
  });

  it('should send traces to agent', done => {
    agentConnection.sendSpans(dummySpans, () => {
      agentControls
        .getSpans()
        .then(spans => {
          expect(spans).to.deep.equal(dummySpans);
          return done();
        })
        .catch(e => done(e));
    });
  });

  it('should cope with circular data structures', done => {
    const circularSpanWithoutCircularReference = Object.assign({}, circularSpan);
    delete circularSpanWithoutCircularReference.data.c.circular;

    agentConnection.sendSpans(dummySpansWithCircularReference, () => {
      agentControls
        .getSpans()
        .then(spans => {
          expect(spans).to.have.lengthOf(3);
          expect(spans[0]).to.deep.equal(dummyExit);
          expect(spans[1]).to.deep.equal(circularSpanWithoutCircularReference);
          expect(spans[2]).to.deep.equal(dummyEntry);
          return done();
        })
        .catch(e => done(e));
    });
  });

  it('should throw error if size of payload exceeds maxContentLength', done => {
    const bigData = 'a'.repeat(1024 * 1024 * 21);
    const bigSpan = {
      n: 'span.exit',
      t: 'trace-id',
      p: 'entry-span-id',
      s: 'exit-span-id',
      k: constants.ENTRY,
      data: {
        bigData
      }
    };
    const spans = [bigSpan];

    agentConnection.sendSpans(spans, err => {
      expect(err.message).to.match(/Request payload is too large/);
      done();
    });
  });

  it('should throw error if size of payload exceeds maxContentLength for profiles', done => {
    const bigData = 'a'.repeat(1024 * 1024 * 21);
    const profiles = { profile: bigData };

    agentConnection.sendProfiles(profiles, err => {
      expect(err.message).to.match(/Request payload is too large/);
      done();
    });
  });
};
