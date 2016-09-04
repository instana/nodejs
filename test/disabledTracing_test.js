'use strict';

var expect = require('chai').expect;
var Promise = require('bluebird');

var supportsAsyncWrap = require('../src/tracing/index').supportsAsyncWrap;
var agentStubControls = require('./apps/agentStubControls');
var expressControls = require('./apps/expressControls');
var config = require('./config');
var utils = require('./utils');

describe('disabled tracing', function() {
  if (!supportsAsyncWrap(process.versions.node)) {
    return;
  }

  this.timeout(config.getTestTimeout());

  agentStubControls.registerTestHooks();
  expressControls.registerTestHooks({
    enableTracing: false
  });

  beforeEach(function() {
    return agentStubControls.waitUntilAppIsCompletelyInitialized(expressControls.getPid());
  });

  it('must not send any spans to the agent', function() {
    return expressControls.sendRequest({
      method: 'POST',
      path: '/checkout',
      responseStatus: 201
    })
    .then(function() {
      return Promise.delay(500);
    })
    .then(function() {
      return utils.retry(function() {
        return agentStubControls.getSpans()
        .then(function(spans) {
          expect(spans).to.have.lengthOf(0);
        });
      });
    });
  });
});
