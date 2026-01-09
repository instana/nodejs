/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const expect = require('chai').expect;

const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const {
  retry,
  verifyHttpRootEntry,
  verifyExitSpan,
  expectAtLeastOneMatching
} = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');
const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

['latest', 'v2.7.0'].forEach(version => {
  mochaSuiteFn(`tracing/node-fetch @${version}`, function () {
    // Skip testing the latest version in CommonJS mode, as it is ESM-only.
    // From v3 onwards, node-fetch is a pure ESM module and does not support require().
    if (!process.env.RUN_ESM && version === 'latest') return;

    // Curently we do not run ESM tests for all versions, so skip the ESM app for non-latest versions.
    // TODO: Support for mocking `import` in ESM apps is planned under INSTA-788.
    if (process.env.RUN_ESM && version !== 'latest') return;

    this.timeout(config.getTestTimeout());

    globalAgent.setUpCleanUpHooks();
    const agentControls = globalAgent.instance;

    let controls;

    before(async () => {
      controls = new ProcessControls({
        dirname: __dirname,
        useGlobalAgent: true,
        env: { NODE_FETCH_VERSION: version }
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
  });
});
