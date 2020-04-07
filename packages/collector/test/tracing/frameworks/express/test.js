'use strict';

const path = require('path');
const expect = require('chai').expect;

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const tracingUtil = require('../../../../../core/src/tracing/tracingUtil');
const config = require('../../../../../core/test/config');
const testUtils = require('../../../../../core/test/test_util');
const ProcessControls = require('../../ProcessControls');

describe('tracing/express', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  const agentControls = require('../../../apps/agentStubControls');

  this.timeout(config.getTestTimeout());

  agentControls.registerTestHooks();

  const controls = new ProcessControls({
    appPath: path.join(__dirname, 'app'),
    agentControls
  }).registerTestHooks();

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
              testUtils.expectAtLeastOneMatching(spans, span => {
                expect(span.n).to.equal('node.http.server');
                expect(span.k).to.equal(constants.ENTRY);
                expect(span.data.http.path_tpl).to.equal(expectedTemplate);
              });
            })
          )
        );
      });
    }
  });
});
