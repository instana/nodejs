/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const expect = require('chai').expect;

const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../core/test/config');
const ProcessControls = require('../../test_util/ProcessControls');
const globalAgent = require('../../globalAgent');

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('tracing/api', function () {
  this.timeout(config.getTestTimeout());

  globalAgent.setUpCleanUpHooks();

  describe('when tracing is enabled', () => {
    const controls = new ProcessControls({
      dirname: __dirname,
      useGlobalAgent: true
    });
    ProcessControls.setUpHooks(controls);

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

    it('must annotate a nested value (path given as flat string)', () =>
      controls
        .sendRequest({
          method: 'GET',
          path: '/span/annotate-path-flat-string'
        })
        .then(response => {
          const span = response.span;
          expect(span).to.exist;
          expect(span.traceId).to.be.not.null;
          expect(span.spanId).to.be.not.null;
          expect(span.parentSpanId).to.not.exist;
          expect(span.name).to.equal('node.http.server');
          expect(span.data.sdk.custom.tags.key).to.equal('custom nested tag value');
          expect(span.data.http.path_tpl).to.equal('/custom/{template}');
          expect(span.data.redundant.dots).to.equal('will be silently dropped');
          expect(span.handleConstructorName).to.equal('SpanHandle');
        }));

    it('must annotate a nested value (path given as array)', () =>
      controls
        .sendRequest({
          method: 'GET',
          path: '/span/annotate-path-array'
        })
        .then(response => {
          const span = response.span;
          expect(span).to.exist;
          expect(span.traceId).to.be.not.null;
          expect(span.spanId).to.be.not.null;
          expect(span.parentSpanId).to.not.exist;
          expect(span.name).to.equal('node.http.server');
          expect(span.data.sdk.custom.tags.key).to.equal('custom nested tag value');
          expect(span.data.http.path_tpl).to.equal('/custom/{template}');
          expect(span.handleConstructorName).to.equal('SpanHandle');
        }));

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
      useGlobalAgent: true,
      tracingEnabled: false
    });
    ProcessControls.setUpHooks(controls);

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
          path: '/span/annotate-path-flat-string'
        })
        .then(response => {
          const span = response.span;
          expect(span).to.exist;
          expect(span.data).to.not.exist;
        }));
  });
});
