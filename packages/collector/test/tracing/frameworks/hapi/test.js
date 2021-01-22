/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. 2018
 */

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
  supportedVersion(process.versions.node) && semver.gte(process.versions.node, '8.2.1') ? describe : describe.skip;

mochaSuiteFn('tracing/hapi', function() {
  this.timeout(config.getTestTimeout());

  const agentControls = globalAgent.instance;
  globalAgent.setUpCleanUpHooks();

  const controls = new ProcessControls({
    appPath: path.join(__dirname, 'app'),
    useGlobalAgent: true
  });
  ProcessControls.setUpHooks(controls);

  describe('hapi path templates', () => {
    check('/route/mandatory/value', '/route/mandatory/{param}');
    check('/route/optional/value', '/route/optional/{param?}');
    check('/route/optional', '/route/optional/{param?}');
    check('/route/partialvalue/resource', '/route/partial{param}/resource');
    check('/route/multi-segment/one/two', '/route/multi-segment/{param*2}');

    function check(actualPath, expectedTemplate) {
      it(`must report hapi path templates for actual path: ${actualPath}`, () =>
        controls
          .sendRequest({
            method: 'GET',
            path: actualPath,
            simple: false,
            resolveWithFullResponse: true
          })
          .then(response => {
            expect(response.statusCode).to.equal(200);
            expect(response.body).to.equal(expectedTemplate);
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
