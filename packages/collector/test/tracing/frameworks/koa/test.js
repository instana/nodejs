'use strict';

const path = require('path');
const semver = require('semver');
const expect = require('chai').expect;

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const testUtils = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');

const mochaSuiteFn =
  supportedVersion(process.versions.node) && semver.gte(process.versions.node, '6.0.0') ? describe : describe.skip;

mochaSuiteFn('tracing/koa', function() {
  this.timeout(config.getTestTimeout());

  const agentControls = globalAgent.instance;
  globalAgent.setUpCleanUpHooks();

  const controls = new ProcessControls({
    appPath: path.join(__dirname, 'app'),
    useGlobalAgent: true
  });
  ProcessControls.setUpHooks(controls);

  describe('koa path templates', () => {
    check('/route', '/route');
    check('/route/123', '/route/:id');
    check('/sub1', '/sub1/');
    check('/sub1/route', '/sub1/route');
    check('/sub1/route/123', '/sub1/route/:id');
    check('/sub1/sub2', '/sub1/sub2/');
    check('/sub1/sub2/route', '/sub1/sub2/route');
    check('/sub1/sub2/route/123', '/sub1/sub2/route/:id');
    check('/does-not-exist-so-use-catch-all-regexp', '/.*/');

    function check(actualPath, expectedTemplate) {
      it(`must report koa-router path templates for actual path: ${actualPath}`, () =>
        controls
          .sendRequest({
            method: 'GET',
            path: actualPath,
            simple: false,
            resolveWithFullResponse: true
          })
          .then(response => {
            expect(response.statusCode).to.equal(200);
            expect(response.body.indexOf(actualPath)).to.equal(
              0,
              `Unexpected response: ${response.body} should have started with ${actualPath}.`
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
