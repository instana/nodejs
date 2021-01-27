/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const path = require('path');
const expect = require('chai').expect;
const semver = require('semver');

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const testUtils = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');

const mochaSuiteFn =
  supportedVersion(process.versions.node) && semver.gte(process.versions.node, '8.0.0') ? describe : describe.skip;

mochaSuiteFn('tracing/fastify', function() {
  this.timeout(config.getTestTimeout());

  const agentControls = globalAgent.instance;
  globalAgent.setUpCleanUpHooks();

  const controls = new ProcessControls({
    appPath: path.join(__dirname, 'app'),
    useGlobalAgent: true
  });
  ProcessControls.setUpHooks(controls);

  describe('path templates', () => {
    check('/', 200, { hello: 'world' }, '/');
    check('/foo/42', 200, { hello: 'world' }, '/foo/:id');
    check('/before-handler/13', 200, { before: 'handler' }, '/before-handler/:id');
    check(
      '/before-handler-array/02',
      500,
      { statusCode: 500, error: 'Internal Server Error', message: 'Yikes' },
      '/before-handler-array/:id'
    );
    check('/sub', 200, { hello: 'world' }, '/sub');
    check('/sub/bar/42', 200, { hello: 'world' }, '/sub/bar/:id');

    function check(actualPath, expectedStatusCode, expectedResponse, expectedTemplate) {
      it(`must report path templates for actual path: ${actualPath}`, () =>
        controls
          .sendRequest({
            method: 'GET',
            path: actualPath,
            simple: false,
            resolveWithFullResponse: true
          })
          .then(response => {
            expect(response.statusCode).to.equal(expectedStatusCode);
            expect(response.body).to.deep.equal(expectedResponse);
            return testUtils.retry(() =>
              agentControls.getSpans().then(spans => {
                testUtils.expectAtLeastOneMatching(spans, [
                  span => expect(span.data.http.path_tpl).to.equal(expectedTemplate),
                  span => expect(span.data.http.status).to.equal(expectedStatusCode),
                  span => expect(span.data.http.url).to.equal(actualPath),
                  span => expect(span.k).to.equal(constants.ENTRY)
                ]);
              })
            );
          }));
    }
  });
});
