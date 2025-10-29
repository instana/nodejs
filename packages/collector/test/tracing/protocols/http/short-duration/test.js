/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const { expect } = require('chai');
const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../../core/test/config');
const { retry } = require('../../../../../../core/test/test_util');
const ProcessControls = require('../../../../test_util/ProcessControls');
const { AgentStubControls } = require('../../../../apps/agentStubControls');

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('tracing/http short duration', function () {
  this.timeout(config.getTestTimeout());

  const agentControls = new AgentStubControls();
  let controls;

  before(async () => {
    await agentControls.startAgent();
    controls = new ProcessControls({
      dirname: __dirname,
      agentControls
    });
    await controls.startAndWaitForAgentConnection();
  });

  after(async () => {
    await controls.stop();
    await agentControls.stopAgent();
  });

  beforeEach(async () => {
    await agentControls.clearReceivedData();
  });

  it('should record a duration of 0 when there is nothing to process', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/'
      })
      .then(() =>
        retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntry = verifyHttpEntry(spans, controls, '/');
            // Expect near-zero processing time for an immediate OK response
            expect(httpEntry.d).to.be.lessThan(1);
            expect(httpEntry.d).to.be.eql(0);
          })
        )
      ));

  it('should record 0 duration for ultra-short microsecond endpoint', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/duration-micro-sec'
      })
      .then(() =>
        retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntry = verifyHttpEntry(spans, controls, '/duration-micro-sec');
            // The delay (~10 µs) is too small to be measurable with millisecond precision,
            // so the duration is expected to appear as 0.
            expect(httpEntry.d).to.be.eql(0);
          })
        )
      ));

  it('should record a measurable duration for a normal endpoint', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/normal'
      })
      .then(() =>
        retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntry = verifyHttpEntry(spans, controls, '/normal');
            // a ~5 ms delay
            expect(httpEntry.d).to.be.at.least(5);
          })
        )
      ));
});

function verifyHttpEntry(spans, controls, url = '/', method = 'GET') {
  expect(spans.length).to.equal(1);
  const span = spans[0];
  expect(span.n).to.equal('node.http.server');
  expect(span.k).to.equal(constants.ENTRY);
  expect(span.data.http.method).to.equal(method);
  expect(span.data.http.url).to.equal(url);
  expect(span.data.http.host).to.equal(`localhost:${controls.getPort()}`);

  return span;
}
