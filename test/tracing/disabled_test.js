'use strict';

var expect = require('chai').expect;
var Promise = require('bluebird');

var supportedVersion = require('../../src/tracing/index').supportedVersion;
var config = require('../config');
var utils = require('../utils');

/**
 * Tests behaviour when the Instana Node.js sensor is active but tracing is disabled.
 */
describe('disabled tracing', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  // controls require features that aren't available in early Node.js versions
  var agentStubControls = require('../apps/agentStubControls');
  var expressControls = require('../apps/expressControls');

  this.timeout(config.getTestTimeout());

  agentStubControls.registerTestHooks();
  expressControls.registerTestHooks({
    enableTracing: false
  });

  beforeEach(function() {
    return agentStubControls.waitUntilAppIsCompletelyInitialized(expressControls.getPid());
  });

  it('must not send any spans to the agent', function() {
    return expressControls
      .sendRequest({
        method: 'POST',
        path: '/checkout',
        responseStatus: 201
      })
      .then(function() {
        return Promise.delay(500);
      })
      .then(function() {
        return utils.retry(function() {
          return agentStubControls.getSpans().then(function(spans) {
            expect(spans).to.have.lengthOf(0);
          });
        });
      });
  });
});
