'use strict';

var expect = require('chai').expect;
var semver = require('semver');

var config = require('../../config');
var utils = require('../../utils');

describe('tracing/requireHook', function() {
  if (semver.lt(process.versions.node, '8.0.0')) {
    return;
  }

  // controls require features that aren't available in early Node.js versions
  var agentControls = require('../../apps/agentStubControls');
  var Controls = require('./controls');

  this.timeout(config.getTestTimeout());

  agentControls.registerTestHooks();

  var controls = new Controls({
    agentControls: agentControls
  });
  controls.registerTestHooks();

  describe('stealthy require', function() {
    it('must not apply caching when not necessary / or when something is fishy', function() {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/requireRequestPromiseMultipleTimes'
        })
        .then(function() {
          return utils.retry(function() {
            return agentControls.getSpans().then(function(spans) {
              utils.expectOneMatching(spans, function(span) {
                expect(span.n).to.equal('node.http.server');
                expect(span.data.http.status).to.equal(200);
              });
            });
          });
        });
    });
  });
});
