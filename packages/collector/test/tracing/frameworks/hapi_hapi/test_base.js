/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const expect = require('chai').expect;
const constants = require('@_local/core').tracing.constants;
const testUtils = require('@_local/core/test/test_util');
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');
const globalAgent = require('@_local/collector/test/globalAgent');

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
            simple: false
          })
          .then(response => {
            expect(response).to.equal(expectedTemplate);
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
