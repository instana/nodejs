'use strict';

var expect = require('chai').expect;
var semver = require('semver');

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
    check('/', '/');
    check('/foo/42', '/foo/:id');
    check('/sub', '/sub');
    check('/sub/bar/42', '/sub/bar/:id');

    function check(actualPath, expectedTemplate) {
      it('must report path templates for actual path: ' + actualPath, function() {
        return controls
          .sendRequest({
            method: 'GET',
            path: actualPath
          })
          .then(function() {
            return utils.retry(function() {
              return agentControls.getSpans().then(function(spans) {
                utils.expectOneMatching(spans, function(span) {
                  expect(span.data.http.path_tpl).to.equal(expectedTemplate);
                  expect(span.data.http.status).to.equal(200);
                  expect(span.data.http.url).to.equal(actualPath);
                });
              });
            });
          });
      });
    }
  });
});
