/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const expect = require('chai').expect;

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const testConfig = require('../../core/test/config');
const normalizeConfig = require('../src/util/normalizeConfig');
const testUtils = require('../../core/test/test_util');

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

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('agent connection', function () {
  this.timeout(testConfig.getTestTimeout());

  const { AgentStubControls } = require('./apps/agentStubControls');
  const agentControls = new AgentStubControls();

  const pidStore = require('../src/pidStore');
  let agentConnection;

  before(async () => {
    await agentControls.startAgent();
  });
  after(async () => {
    await agentControls.stopAgent();
  });

  beforeEach(async () => {
    const config = normalizeConfig({ agentPort: agentControls.getPort() });
    config.logger = testUtils.createFakeLogger();

    agentConnection = require('../src/agentConnection');
    pidStore.init(config);
    agentConnection.init(config, pidStore);

    await agentControls.simulateDiscovery(process.pid);
    await agentControls.clearReceivedData();
  });

  it('should send traces to agent', done => {
    agentConnection.sendSpans(dummySpans, err => {
      if (err) {
        return done(err);
      }

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

    agentConnection.sendSpans(dummySpansWithCircularReference, err => {
      if (err) {
        return done(err);
      }
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
});
