'use strict';

const expect = require('chai').expect;
const semver = require('semver');

const constants = require('@instana/core').tracing.constants;
const config = require('../../../../../core/test/config');
const utils = require('../../../../../core/test/utils');

describe('tracing/fastify', function() {
  if (semver.lt(process.versions.node, '8.0.0')) {
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
            return utils.retry(() =>
              agentControls.getSpans().then(spans => {
                utils.expectOneMatching(spans, span => {
                  expect(span.data.http.path_tpl).to.equal(expectedTemplate);
                  expect(span.data.http.status).to.equal(expectedStatusCode);
                  expect(span.data.http.url).to.equal(actualPath);
                  expect(span.k).to.equal(constants.ENTRY);
                });
              })
            );
          }));
    }
  });
});
