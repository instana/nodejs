'use strict';

const expect = require('chai').expect;

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../config');
const utils = require('../../../utils');

describe('tracing/express', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  const agentControls = require('../../../apps/agentStubControls');
  const Controls = require('./controls');

  this.timeout(config.getTestTimeout());

  agentControls.registerTestHooks();

  const controls = new Controls({
    agentControls
  });
  controls.registerTestHooks();

  describe('express.js path templates', () => {
    check('/blub', '/blub');
    check('/sub/bar/42', '/sub/bar/:id');
    check('/sub/sub/bar/42', '/sub/sub/bar/:id');

    function check(actualPath, expectedTemplate) {
      it(`must report express path templates for actual path: ${actualPath}`, () =>
        controls
          .sendRequest({
            method: 'GET',
            path: actualPath
          })
          .then(() =>
            utils.retry(() =>
              agentControls.getSpans().then(spans => {
                utils.expectOneMatching(spans, span => {
                  expect(span.n).to.equal('node.http.server');
                  expect(span.k).to.equal(constants.ENTRY);
                  expect(span.data.http.path_tpl).to.equal(expectedTemplate);
                });
              })
            )
          ));
    }
  });
});
