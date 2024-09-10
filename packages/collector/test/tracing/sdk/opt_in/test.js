/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const expect = require('chai').expect;

const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const { verifyEntrySpan } = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');
const constants = require('@instana/core').tracing.constants;

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('tracing/sdk/opt_in', function () {
  this.timeout(config.getTestTimeout());

  const agentControls = globalAgent.instance;
  globalAgent.setUpCleanUpHooks();

  let controls;

  before(async () => {
    controls = new ProcessControls({
      dirname: __dirname,
      useGlobalAgent: true
    });

    await controls.startAndWaitForAgentConnection();
  });

  beforeEach(async () => {
    await agentControls.clearReceivedTraceData();
  });

  after(async () => {
    await controls.stop();
  });

  afterEach(async () => {
    await controls.clearIpcMessages();
  });

  it('should collect sdk wrapped spans', async () => {
    await controls.sendRequest({
      method: 'GET',
      path: '/sdk-wrap'
    });

    const spans = await agentControls.getSpans();
    // expect(spans.length).to.equal(2);
    verifyEntrySpan({
      spanName: 'node.http.server',
      spans,
      withError: false,
      pid: String(controls.getPid()),
      dataProperty: 'http',
      extraTests: [
        span => {
          expect(span.data.http.method).to.equal('GET');
          expect(span.data.http.url).to.equal('/sdk-wrap');
          expect(span.data.http.status).to.equal(200);
          expect(span.k).to.equal(constants.ENTRY);
        }
      ]
    });

    const exitSpan = spans.find(span => span.n === 'node.http.client');
    expect(exitSpan).to.exist;
    expect(exitSpan.data.http.url).to.equal('https://www.instana.com/');
    expect(exitSpan.k).to.equal(constants.EXIT);
  });

  it('should collect opt-in spans', async () => {
    await controls.sendRequest({
      method: 'GET',
      path: '/no-sdk-wrap'
    });

    const spans = await agentControls.getSpans();

    verifyEntrySpan({
      spanName: 'node.http.server',
      spans,
      withError: false,
      pid: String(controls.getPid()),
      dataProperty: 'http',
      extraTests: [
        span => {
          expect(span.data.http.method).to.equal('GET');
          expect(span.data.http.url).to.equal('/no-sdk-wrap');
          expect(span.data.http.status).to.equal(200);
          expect(span.k).to.equal(constants.ENTRY);
        }
      ]
    });

    const exitSpan = spans.find(span => span.n === 'node.http.client');
    expect(exitSpan).to.exist;
    expect(exitSpan.data.http.url).to.equal('https://www.instana.com/');
    expect(exitSpan.k).to.equal(constants.EXIT);
  });
});
