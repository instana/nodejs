/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const expect = require('chai').expect;

const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const { retry, verifyHttpRootEntry, verifyExitSpan } = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('tracing/got', function () {
  this.timeout(config.getTestTimeout());

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

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

  it('GET request', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/request'
      })
      .then(() =>
        retry(() =>
          agentControls.getSpans().then(spans => {
            expect(spans.length).to.equal(2);

            const httpEntry = verifyHttpRootEntry({
              spans,
              apiPath: '/request',
              pid: String(controls.getPid())
            });

            verifyExitSpan({
              spanName: 'node.http.client',
              spans,
              parent: httpEntry,
              withError: false,
              pid: String(controls.getPid()),
              dataProperty: 'http',
              extraTests: [
                span => {
                  expect(span.data.http.method).to.equal('GET');
                  expect(span.data.http.url).to.equal(`http://127.0.0.1:${agentControls.agentPort}/ping`);
                  expect(span.data.http.status).to.equal(200);
                }
              ]
            });
          })
        )
      ));
});
