'use strict';

var expect = require('chai').expect;
var semver = require('semver');

var config = require('../../../config');
var utils = require('../../../utils');

describe('tracing/asyncAwait', function() {
  if (!semver.satisfies(process.versions.node, '^8 || ^9 || ^10')) {
    return;
  }

  // controls require features that aren't available in early Node.js versions
  var expressAsyncAwaitControls = require('./controls');
  var agentStubControls = require('../../../apps/agentStubControls');
  var expressControls = require('../../../apps/expressControls');

  this.timeout(config.getTestTimeout());

  agentStubControls.registerTestHooks();
  expressControls.registerTestHooks();

  beforeEach(function() {
    return agentStubControls.waitUntilAppIsCompletelyInitialized(expressControls.getPid());
  });

  describe('custom http client wrapper with native promises', function() {
    expressAsyncAwaitControls.registerTestHooks({
      upstreamPort: expressControls.appPort
    });

    beforeEach(function() {
      return agentStubControls.waitUntilAppIsCompletelyInitialized(expressAsyncAwaitControls.getPid());
    });

    testAsyncControlFlow();
  });

  describe('request-promise', function() {
    expressAsyncAwaitControls.registerTestHooks({
      upstreamPort: expressControls.appPort,
      useRequestPromise: true
    });

    beforeEach(function() {
      return agentStubControls.waitUntilAppIsCompletelyInitialized(expressAsyncAwaitControls.getPid());
    });

    testAsyncControlFlow();
  });

  function testAsyncControlFlow() {
    it('must follow async control flow', function() {
      return expressAsyncAwaitControls.sendRequest().then(function() {
        return utils.retry(function() {
          return agentStubControls.getSpans().then(function(spans) {
            expect(spans.length).to.equal(5, 'Expecting five spans');

            var rootSpan = utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.server');
              expect(span.data.http.url).to.match(/\/getSomething/);
              expect(span.f.e).to.equal(String(expressAsyncAwaitControls.getPid()));
            });

            var client1Span = utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.client');
              expect(span.p).to.equal(rootSpan.s);
              expect(span.f.e).to.equal(String(expressAsyncAwaitControls.getPid()));
              expect(span.data.http.url).to.have.string('/foo');
            });

            utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.server');
              expect(span.p).to.equal(client1Span.s);
              expect(span.f.e).to.equal(String(expressControls.getPid()));
            });

            var client2Span = utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.client');
              expect(span.p).to.equal(rootSpan.s);
              expect(span.f.e).to.equal(String(expressAsyncAwaitControls.getPid()));
              expect(span.data.http.url).to.have.string('/bar');
            });

            utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.server');
              expect(span.p).to.equal(client2Span.s);
              expect(span.f.e).to.equal(String(expressControls.getPid()));
            });
          });
        });
      });
    });
  }
});
