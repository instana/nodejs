'use strict';

var expect = require('chai').expect;

var supportedVersion = require('@instana/core').tracing.supportedVersion;
var config = require('../../config');

describe('tracing/api', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  var agentControls = require('../../apps/agentStubControls');
  var Controls = require('./controls');

  this.timeout(config.getTestTimeout());

  agentControls.registerTestHooks();

  describe('when tracing is enabled', function() {
    var controls = new Controls({
      agentControls: agentControls
    });
    controls.registerTestHooks();

    it('must provide details for currently active span', function() {
      var now = Date.now();
      return controls
        .sendRequest({
          method: 'GET',
          path: '/span/active'
        })
        .then(function(response) {
          var span = response.span;
          expect(span).to.exist;
          expect(span.traceId).to.be.not.null;
          expect(span.spanId).to.be.not.null;
          expect(span.parentSpanId).to.not.exist;
          expect(span.name).to.equal('node.http.server');
          expect(span.isEntry).to.be.true;
          expect(span.isExit).to.be.false;
          expect(span.isIntermediate).to.be.false;
          expect(span.timestamp).to.be.gte(now);
          expect(span.timestamp).to.be.lte(now + 1000);
          // span is not yet completed when it is serialized
          expect(span.duration).to.equal(0);
          expect(span.errorCount).to.equal(0);
          expect(span.handleConstructorName).to.equal('SpanHandle');
        });
    });

    it('must manually end the currently active span', function() {
      var now = Date.now();
      return controls
        .sendRequest({
          method: 'GET',
          path: '/span/manuallyended'
        })
        .then(function(response) {
          var span = response.span;
          expect(span).to.exist;
          expect(span.traceId).to.be.not.null;
          expect(span.spanId).to.be.not.null;
          expect(span.parentSpanId).to.not.exist;
          expect(span.name).to.equal('node.http.server');
          expect(span.isEntry).to.be.true;
          expect(span.isExit).to.be.false;
          expect(span.isIntermediate).to.be.false;
          expect(span.timestamp).to.be.gte(now);
          expect(span.timestamp).to.be.lte(now + 1000);
          expect(span.duration).to.be.gt(0);
          expect(span.errorCount).to.equal(42);
          expect(span.handleConstructorName).to.equal('SpanHandle');
        });
    });
  });

  describe('when tracing is not enabled', function() {
    var controls = new Controls({
      agentControls: agentControls,
      tracingEnabled: false
    });
    controls.registerTestHooks();

    it('must provide a noop span handle', function() {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/span/active'
        })
        .then(function(response) {
          var span = response.span;
          expect(span).to.exist;
          expect(span.traceId).to.be.null;
          expect(span.spanId).to.be.null;
          expect(span.parentSpanId).to.be.null;
          expect(span.name).to.be.null;
          expect(span.isEntry).to.be.false;
          expect(span.isExit).to.be.false;
          expect(span.isIntermediate).to.be.false;
          expect(span.timestamp).to.equal(0);
          expect(span.duration).to.equal(0);
          expect(span.errorCount).to.equal(0);
          expect(span.handleConstructorName).to.equal('NoopSpanHandle');
        });
    });

    it('must do nothing when trying to manually end the currently active span', function() {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/span/manuallyended'
        })
        .then(function(response) {
          var span = response.span;
          expect(span).to.exist;
          expect(span.traceId).to.be.null;
          expect(span.spanId).to.be.null;
          expect(span.parentSpanId).to.be.null;
          expect(span.name).to.be.null;
          expect(span.isEntry).to.be.false;
          expect(span.isExit).to.be.false;
          expect(span.isIntermediate).to.be.false;
          expect(span.timestamp).to.equal(0);
          expect(span.duration).to.equal(0);
          expect(span.errorCount).to.equal(0);
          expect(span.handleConstructorName).to.equal('NoopSpanHandle');
        });
    });
  });
});
