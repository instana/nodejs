/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const expect = require('chai').expect;

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const testUtils = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('tracing/koa', function () {
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
});
