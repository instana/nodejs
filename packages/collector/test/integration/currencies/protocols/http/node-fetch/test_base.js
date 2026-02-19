/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const expect = require('chai').expect;

const config = require('@_local/core/test/config');
const { retry, verifyHttpRootEntry, verifyExitSpan, expectAtLeastOneMatching } = require('@_local/core/test/test_util');
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');
const globalAgent = require('@_local/collector/test/globalAgent');

module.exports = function (name, version, isLatest) {
  this.timeout(config.getTestTimeout());

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  let controls;

  before(async () => {
    controls = new ProcessControls({
      dirname: __dirname,
      useGlobalAgent: true,
      env: {
        LIBRARY_VERSION: version,
        LIBRARY_NAME: name,
        LIBRARY_LATEST: isLatest
      }
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

  it('must not explode when request with a malformed url', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/callInvalidUrl',
        simple: false
      })
      .then(() =>
        retry(() =>
          agentControls.getSpans().then(spans => {
            expect(spans).to.have.lengthOf(1);

            expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.error).to.not.exist,
              span => expect(span.ec).to.equal(1)
            ]);
          })
        )
      ));
};
