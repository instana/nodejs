/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const expect = require('chai').expect;

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../core/test/config');

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
  this.timeout(config.getTestTimeout());

  const { AgentStubControls } = require('./apps/agentStubControls');
  const agentControls = new AgentStubControls();

  const agentOpts = require('../src/agent/opts');
  const originalPort = agentOpts.port;
  let agentConnection;

  before(async () => {
    await agentControls.startAgent();
  });
  after(async () => {
    await agentControls.stopAgent();
  });

  beforeEach(async () => {
    agentOpts.port = agentControls.getPort();
    agentConnection = require('../src/agentConnection');
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
});
