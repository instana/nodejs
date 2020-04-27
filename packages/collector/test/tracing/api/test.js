'use strict';

const expect = require('chai').expect;

const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../core/test/config');
const ProcessControls = require('../../test_util/ProcessControls');

describe('tracing/api', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  const agentControls = require('../../apps/agentStubControls');

  this.timeout(config.getTestTimeout());

  agentControls.registerTestHooks();

  describe('when tracing is enabled', () => {
    const controls = new ProcessControls({
      dirname: __dirname,
      agentControls
    }).registerTestHooks();

    it('must provide details for currently active span', () => {
      const now = Date.now();
      return controls
        .sendRequest({
          method: 'GET',
          path: '/span/active'
        })
        .then(response => {
          const span = response.span;
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

    it('must annotate the active span', () => {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/span/annotate'
        })
        .then(response => {
          const span = response.span;
          expect(span).to.exist;
          expect(span.traceId).to.be.not.null;
          expect(span.spanId).to.be.not.null;
          expect(span.parentSpanId).to.not.exist;
          expect(span.name).to.equal('node.http.server');
          expect(span.data.key1).to.equal('custom tag value 1');
          expect(span.data.key2).to.equal('custom tag value 2');
          expect(span.handleConstructorName).to.equal('SpanHandle');
        });
    });

    it('must manually end the currently active span', () => {
      const now = Date.now();
      return controls
        .sendRequest({
          method: 'GET',
          path: '/span/manuallyended'
        })
        .then(response => {
          const span = response.span;
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

  describe('when tracing is not enabled', () => {
    const controls = new ProcessControls({
      dirname: __dirname,
      agentControls,
      tracingEnabled: false
    }).registerTestHooks();

    it('must provide a noop span handle', () =>
      controls
        .sendRequest({
          method: 'GET',
          path: '/span/active'
        })
        .then(response => {
          const span = response.span;
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
        }));

    it('must do nothing when trying to manually end the currently active span', () =>
      controls
        .sendRequest({
          method: 'GET',
          path: '/span/manuallyended'
        })
        .then(response => {
          const span = response.span;
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
        }));

    it('must do nothing when trying to annotate', () =>
      controls
        .sendRequest({
          method: 'GET',
          path: '/span/annotate'
        })
        .then(response => {
          const span = response.span;
          expect(span).to.exist;
          expect(span.data).to.not.exist;
        }));
  });
});
