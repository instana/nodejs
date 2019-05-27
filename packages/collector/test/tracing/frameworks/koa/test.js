'use strict';

const semver = require('semver');
const expect = require('chai').expect;

const constants = require('@instana/core').tracing.constants;
const config = require('../../../config');
const utils = require('../../../utils');

describe('tracing/koa', function() {
  if (!semver.satisfies(process.versions.node, '>=6.0.0')) {
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
