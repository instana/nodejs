'use strict';

var expect = require('chai').expect;

var supportedVersion = require('../../src/tracing/index').supportedVersion;
var config = require('../config');
var utils = require('../utils');

describe('tracing/stackTraces', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  // controls require features that aren't available in early Node.js versions
  var agentStubControls = require('../apps/agentStubControls');
  var expressProxyControls = require('../apps/expressProxyControls');

  this.timeout(config.getTestTimeout());

  agentStubControls.registerTestHooks();

  describe('with stack trace lenght of 0', function() {
    expressProxyControls.registerTestHooks({
      stackTraceLength: 0
    });

    beforeEach(function() {
      return agentStubControls.waitUntilAppIsCompletelyInitialized(expressProxyControls.getPid());
    });

    it('must not add stack traces to the spans', function() {
      return expressProxyControls
        .sendRequest({
          method: 'POST',
          path: '/checkout',
          responseStatus: 201
        })
        .then(function() {
          return utils.retry(function() {
            return agentStubControls.getSpans().then(function(spans) {
              utils.expectOneMatching(spans, function(span) {
                expect(span.n).to.equal('node.http.server');
                expect(span.stack).to.have.lengthOf(0);
              });

              utils.expectOneMatching(spans, function(span) {
                expect(span.n).to.equal('node.http.client');
                expect(span.stack).to.have.lengthOf(0);
              });
            });
          });
        });
    });
  });

  describe('with enabled stack traces', function() {
    expressProxyControls.registerTestHooks({
      stackTraceLength: 10
    });

    beforeEach(function() {
      return agentStubControls.waitUntilAppIsCompletelyInitialized(expressProxyControls.getPid());
    });

    it('must not add stack traces to entry spans', function() {
      return expressProxyControls
        .sendRequest({
          method: 'POST',
          path: '/checkout',
          responseStatus: 201
        })
        .then(function() {
          return utils.retry(function() {
            return agentStubControls.getSpans().then(function(spans) {
              utils.expectOneMatching(spans, function(span) {
                expect(span.n).to.equal('node.http.server');
                expect(span.stack).to.have.lengthOf(0);
              });
            });
          });
        });
    });

    it('must add stack traces to exit spans', function() {
      return expressProxyControls
        .sendRequest({
          method: 'POST',
          path: '/checkout',
          responseStatus: 201
        })
        .then(function() {
          return utils.retry(function() {
            return agentStubControls.getSpans().then(function(spans) {
              utils.expectOneMatching(spans, function(span) {
                expect(span.n).to.equal('node.http.client');
                expect(span.stack[0].m).to.equal('Request.Request.start [as start]');
                expect(span.stack[0].c).to.match(/request\.js$/i);
              });
            });
          });
        });
    });
  });
});
