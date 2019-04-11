'use strict';

var semver = require('semver');
var expect = require('chai').expect;

var constants = require('@instana/core').tracing.constants;
var config = require('../../../config');
var utils = require('../../../utils');

describe('tracing/koa', function() {
  if (!semver.satisfies(process.versions.node, '>=6.0.0')) {
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

  describe('koa path templates', function() {
    check('/route', '/route');
    check('/route/123', '/route/:id');
    check('/sub1', '/sub1/');
    check('/sub1/route', '/sub1/route');
    check('/sub1/route/123', '/sub1/route/:id');
    check('/sub1/sub2', '/sub1/sub2/');
    check('/sub1/sub2/route', '/sub1/sub2/route');
    check('/sub1/sub2/route/123', '/sub1/sub2/route/:id');

    function check(actualPath, expectedTemplate) {
      it('must report koa-router path templates for actual path: ' + actualPath, function() {
        return controls
          .sendRequest({
            method: 'GET',
            path: actualPath
          })
          .then(function() {
            return utils.retry(function() {
              return agentControls.getSpans().then(function(spans) {
                utils.expectOneMatching(spans, function(span) {
                  expect(span.n).to.equal('node.http.server');
                  expect(span.k).to.equal(constants.ENTRY);
                  expect(span.data.http.path_tpl).to.equal(expectedTemplate);
                });
              });
            });
          });
      });
    }
  });
});
