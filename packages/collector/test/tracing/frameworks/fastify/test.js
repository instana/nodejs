'use strict';

var expect = require('chai').expect;
var semver = require('semver');

var constants = require('@instana/core').tracing.constants;
var config = require('../../../config');
var utils = require('../../../utils');

describe('tracing/fastify', function() {
  if (semver.lt(process.versions.node, '8.0.0')) {
    return;
  }

  var agentControls = require('../../../apps/agentStubControls');
  var Controls = require('./controls');

  this.timeout(config.getTestTimeout());

  agentControls.registerTestHooks();

  var controls = new Controls({
    agentControls: agentControls
  });
  controls.registerTestHooks();

  describe('path templates', function() {
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
      it('must report path templates for actual path: ' + actualPath, function() {
        return controls
          .sendRequest({
            method: 'GET',
            path: actualPath,
            simple: false,
            resolveWithFullResponse: true
          })
          .then(function(response) {
            expect(response.statusCode).to.equal(expectedStatusCode);
            expect(response.body).to.deep.equal(expectedResponse);
            return utils.retry(function() {
              return agentControls.getSpans().then(function(spans) {
                utils.expectOneMatching(spans, function(span) {
                  expect(span.data.http.path_tpl).to.equal(expectedTemplate);
                  expect(span.data.http.status).to.equal(expectedStatusCode);
                  expect(span.data.http.url).to.equal(actualPath);
                  expect(span.k).to.equal(constants.ENTRY);
                });
              });
            });
          });
      });
    }
  });
});
