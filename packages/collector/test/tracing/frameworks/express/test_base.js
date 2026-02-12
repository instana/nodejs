/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const expect = require('chai').expect;

const constants = require('@_local/core').tracing.constants;
const tracingUtil = require('@_local/core/src/tracing/tracingUtil');
const config = require('@_local/core/test/config');
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

  describe('express.js path templates', () => {
    check('/blub', '/blub', true);
    check('/sub/bar/42', '/sub/bar/:id', true);
    check('/sub/sub/bar/42', '/sub/sub/bar/:id', true);
    check('/sub/sub/bar/42', '/sub/sub/bar/:id', false);

    function check(actualPath, expectedTemplate, isRootSpan) {
      it(`must report express path templates for actual path: ${actualPath}`, () => {
        const request = {
          method: 'GET',
          path: actualPath
        };
        if (!isRootSpan) {
          request.headers = {
            'X-INSTANA-T': tracingUtil.generateRandomTraceId(),
            'X-INSTANA-S': tracingUtil.generateRandomSpanId()
          };
        }
        return controls.sendRequest(request).then(() =>
          testUtils.retry(() =>
            agentControls.getSpans().then(spans => {
              testUtils.expectAtLeastOneMatching(spans, [
                span => expect(span.n).to.equal('node.http.server'),
                span => expect(span.k).to.equal(constants.ENTRY),
                span => expect(span.data.http.path_tpl).to.equal(expectedTemplate)
              ]);
            })
          )
        );
      });
    }
  });

  describe('custom path templates via annotate', () => {
    it('must report custom path template', () => {
      const request = {
        method: 'GET',
        path: '/with-annotate'
      };
      return controls.sendRequest(request).then(() =>
        testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.k).to.equal(constants.ENTRY),
              span => expect(span.data.http.path_tpl).to.equal('/user/{id}/details')
            ]);
          })
        )
      );
    });

    it('must report custom path template with additional middleware', () => {
      const request = {
        method: 'GET',
        path: '/annotate-with-middleware',
        qs: {
          authenticated: true
        },
        resolveWithFullResponse: true
      };
      return controls.sendRequest(request).then(() => {
        return testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.k).to.equal(constants.ENTRY),
              span => expect(span.data.http.path_tpl).to.equal('/user/{id}/details')
            ]);
          })
        );
      });
    });

    it('must report custom path template when middleware rejects the request early', () => {
      const request = {
        method: 'GET',
        path: '/annotate-with-middleware',
        qs: {
          authenticated: false
        },
        simple: false,
        resolveWithFullResponse: true
      };
      return controls.sendRequest(request).then(() => {
        return testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.k).to.equal(constants.ENTRY),
              span => expect(span.data.http.path_tpl).to.equal('/user/{id}/details')
            ]);
          })
        );
      });
    });
  });
};
