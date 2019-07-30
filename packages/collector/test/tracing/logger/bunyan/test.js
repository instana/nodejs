'use strict';

const expect = require('chai').expect;

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../config');
const utils = require('../../../utils');

describe('tracing/logger/bunyan', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  this.timeout(config.getTestTimeout());
  const agentControls = require('../../../apps/agentStubControls');
  const appControls = require('./controls');

  describe('trace log calls', () => {
    agentControls.registerTestHooks();
    appControls.registerTestHooks();

    beforeEach(() => agentControls.waitUntilAppIsCompletelyInitialized(appControls.getPid()));

    it('must not trace info', () =>
      appControls.trigger('info').then(() =>
        utils.retry(() =>
          agentControls.getSpans().then(spans => {
            const entrySpan = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.f.e).to.equal(String(appControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
            });
            utils.expectOneMatching(spans, span => {
              checkNextExitSpan(span, entrySpan);
            });
            const bunyanSpans = utils.getSpansByName(spans, 'log.bunyan');
            expect(bunyanSpans).to.be.empty;
          })
        )
      ));

    it('must trace warn', () => runTest('warn', false, 'Warn message - should be traced.'));

    it('must trace error', () => runTest('error', true, 'Error message - should be traced.'));

    it('must trace fatal', () => runTest('fatal', true, 'Fatal message - should be traced.'));

    it("must capture an error object's message", () => runTest('error-object-only', true, 'This is an error.'));

    it("must capture a nested error object's message", () =>
      runTest('nested-error-object-only', true, 'This is a nested error.'));

    it('must not serialize random object', () =>
      runTest(
        'error-random-object-only',
        true,
        'Log call without message. ' +
          'The Bunyan "fields" argument will not be serialized by Instana for performance reasons.'
      ));

    it("must capture an error object's message and an additional string", () =>
      runTest('error-object-and-string', true, 'This is an error. -- Error message - should be traced.'));

    it("must capture a nested error object's message and an additional string", () =>
      runTest('nested-error-object-and-string', true, 'This is a nested error. -- Error message - should be traced.'));

    it('must trace random object and string', () =>
      runTest('error-random-object-and-string', true, 'Error message - should be traced.'));

    it('must trace child logger error', () =>
      runTest('child-error', true, 'Child logger error message - should be traced.'));
  });

  // verify that Instana's own Bunyan logging does not get traced
  describe('do not trace Instana log calls', () => {
    describe('Instana creates a new Bunyan logger', () => {
      agentControls.registerTestHooks();
      appControls.registerTestHooks({
        instanaLoggingMode: 'instana-creates-bunyan-logger'
      });

      beforeEach(() => agentControls.waitUntilAppIsCompletelyInitialized(appControls.getPid()));

      it('log calls are not traced', () => verifyInstanaLoggingIsNotTraced());
    });

    describe('Instana receives a Bunyan logger', () => {
      agentControls.registerTestHooks();
      appControls.registerTestHooks({
        instanaLoggingMode: 'instana-receives-bunyan-logger'
      });

      beforeEach(() => agentControls.waitUntilAppIsCompletelyInitialized(appControls.getPid()));

      it('log calls are not traced', () => verifyInstanaLoggingIsNotTraced());
    });

    describe('Instana receives a non-Bunyan logger', () => {
      agentControls.registerTestHooks();
      appControls.registerTestHooks({
        instanaLoggingMode: 'instana-receives-non-bunyan-logger'
      });

      beforeEach(() => agentControls.waitUntilAppIsCompletelyInitialized(appControls.getPid()));

      it('log calls are not traced', () => verifyInstanaLoggingIsNotTraced());
    });
  });

  function runTest(url, expectErroneous, message) {
    return appControls.trigger(url).then(() =>
      utils.retry(() =>
        agentControls.getSpans().then(spans => {
          const entrySpan = utils.expectOneMatching(spans, span => {
            expect(span.n).to.equal('node.http.server');
            expect(span.f.e).to.equal(String(appControls.getPid()));
            expect(span.f.h).to.equal('agent-stub-uuid');
          });
          utils.expectOneMatching(spans, span => {
            checkBunyanSpan(span, entrySpan, expectErroneous, message);
          });
          utils.expectOneMatching(spans, span => {
            checkNextExitSpan(span, entrySpan);
          });

          // verify that nothing logged by Instana has been traced
          const allBunyanSpans = utils.getSpansByName(spans, 'log.bunyan');
          expect(allBunyanSpans.length).to.equal(1);
        })
      )
    );
  }

  function checkBunyanSpan(span, parent, erroneous, message) {
    expect(span.t).to.equal(parent.t);
    expect(span.p).to.equal(parent.s);
    expect(span.k).to.equal(constants.EXIT);
    expect(span.f.e).to.equal(String(appControls.getPid()));
    expect(span.f.h).to.equal('agent-stub-uuid');
    expect(span.n).to.equal('log.bunyan');
    expect(span.async).to.equal(false);
    expect(span.error).to.equal(erroneous);
    expect(span.ec).to.equal(erroneous ? 1 : 0);
    expect(span.data).to.exist;
    expect(span.data.log).to.exist;
    expect(span.data.log.message).to.equal(message);
  }

  function checkNextExitSpan(span, parent) {
    expect(span.t).to.equal(parent.t);
    expect(span.p).to.equal(parent.s);
    expect(span.k).to.equal(constants.EXIT);
    expect(span.f.e).to.equal(String(appControls.getPid()));
    expect(span.f.h).to.equal('agent-stub-uuid');
    expect(span.n).to.equal('node.http.client');
  }

  function verifyInstanaLoggingIsNotTraced() {
    return appControls.trigger('trigger').then(() =>
      utils.retry(() =>
        agentControls.getSpans().then(spans => {
          utils.expectOneMatching(spans, span => {
            expect(span.n).to.equal('node.http.server');
            expect(span.f.e).to.equal(String(appControls.getPid()));
            expect(span.f.h).to.equal('agent-stub-uuid');
          });

          // verify that nothing logged by Instana has been traced
          const allBunyanSpans = utils.getSpansByName(spans, 'log.bunyan');
          expect(allBunyanSpans).to.be.empty;
        })
      )
    );
  }
});
