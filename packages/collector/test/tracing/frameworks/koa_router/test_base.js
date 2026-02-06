/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const expect = require('chai').expect;

const constants = require('@_instana/core').tracing.constants;
const config = require('@_instana/core/test/config');
const testUtils = require('@_instana/core/test/test_util');
const ProcessControls = require('@_instana/collector/test/test_util/ProcessControls');
const globalAgent = require('@_instana/collector/test/globalAgent');

module.exports = function (name, version, isLatest) {
  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  let controls;

  before(async () => {
    controls = new ProcessControls({
      dirname: __dirname,
      useGlobalAgent: true,
      env: {
        LIBRARY_LATEST: isLatest,
        LIBRARY_VERSION: version,
        LIBRARY_NAME: name
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

  describe('koa path templates', () => {
    check('/route', '/route');
    check('/route/123', '/route/:id');
    check('/sub1', '/sub1');
    check('/sub1/route', '/sub1/route');
    check('/sub1/route/123', '/sub1/route/:id');
    check('/sub1/sub2', '/sub1/sub2');
    check('/sub1/sub2/route', '/sub1/sub2/route');
    check('/sub1/sub2/route/123', '/sub1/sub2/route/:id');
    check('/does-not-exist-so-use-catch-all-regexp', '/.*/');

    function check(actualPath, expectedTemplate) {
      it(`must report @koa/router path templates for actual path: ${actualPath}`, () =>
        controls
          .sendRequest({
            method: 'GET',
            path: actualPath,
            simple: false
          })
          .then(response => {
            expect(response.indexOf(actualPath)).to.equal(
              0,
              `Unexpected response: ${response} should have started with ${actualPath}.`
            );
            return testUtils.retry(() =>
              agentControls.getSpans().then(spans => {
                testUtils.expectAtLeastOneMatching(spans, [
                  span => expect(span.n).to.equal('node.http.server'),
                  span => expect(span.k).to.equal(constants.ENTRY),
                  span => expect(span.data.http.path_tpl).to.equal(expectedTemplate)
                ]);
              })
            );
          }));
    }
  });
};
