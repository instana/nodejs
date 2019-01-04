'use strict';

var expect = require('chai').expect;

var cls = require('../../../../src/tracing/cls');
var supportedVersion = require('../../../../src/tracing/index').supportedVersion;
var config = require('../../../config');
var utils = require('../../../utils');

describe('tracing/express', function() {
  if (!supportedVersion(process.versions.node)) {
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

  describe('express.js path templates', function() {
    check('/blub', '/blub');
    check('/sub/bar/42', '/sub/bar/:id');
    check('/sub/sub/bar/42', '/sub/sub/bar/:id');

    function check(actualPath, expectedTemplate) {
      it('must report express path templates for actual path: ' + actualPath, function() {
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
                  expect(span.k).to.equal(cls.ENTRY);
                  expect(span.data.http.path_tpl).to.equal(expectedTemplate);
                });
              });
            });
          });
      });
    }
  });
});
