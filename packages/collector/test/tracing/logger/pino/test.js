'use strict';

const semver = require('semver');
const expect = require('chai').expect;

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../config');
const utils = require('../../../utils');

describe('tracing/logger/pino', function() {
  // Pino 5 does not support Node.js 4, it uses EcmaScript language features that only work in more recent versions.
  if (!supportedVersion(process.versions.node) || semver.lt(process.versions.node, '6.0.0')) {
    return;
  }

  this.timeout(config.getTestTimeout());
  const agentControls = require('../../../apps/agentStubControls');
  const appControls = require('./controls');
  agentControls.registerTestHooks();
  appControls.registerTestHooks();

  beforeEach(() => agentControls.waitUntilAppIsCompletelyInitialized(appControls.getPid()));

  runTests(false);
  runTests(true);

  function runTests(useExpressPino) {
    const suffix = useExpressPino ? ' (express-pino)' : '';

    it(`must not trace info${suffix}`, () =>
      appControls.trigger('info', useExpressPino).then(() =>
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
            const pinoSpans = utils.getSpansByName(spans, 'log.pino');
            expect(pinoSpans).to.be.empty;
          })
        )
      ));

    it(`must trace warn${suffix}`, () => runTest('warn', useExpressPino, false, 'Warn message - should be traced.'));

    it(`must trace error${suffix}`, () => runTest('error', useExpressPino, true, 'Error message - should be traced.'));

    it(`must trace fatal${suffix}`, () => runTest('fatal', useExpressPino, true, 'Fatal message - should be traced.'));

    it(`must trace error object without message${suffix}`, () =>
      runTest('error-object-only', useExpressPino, true, 'This is an error.'));

    it(`must not serialize random object${suffix}`, () =>
      runTest(
        'error-random-object-only',
        useExpressPino,
        true,
        'Log call without message. ' +
          'The Pino mergingObject argument will not be serialized by Instana for performance reasons.'
      ));

    it(`must trace error object and string${suffix}`, () =>
      runTest(
        'error-object-and-string',
        useExpressPino,
        true,
        'This is an error. -- Error message - should be traced.'
      ));

    it(`must trace random object and string${suffix}`, () =>
      runTest('error-random-object-and-string', useExpressPino, true, 'Error message - should be traced.'));

    it(`must not trace custom info${suffix}`, () =>
      appControls.trigger('custom-info', useExpressPino).then(() =>
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
            const pinoSpans = utils.getSpansByName(spans, 'log.pino');
            expect(pinoSpans).to.be.empty;
          })
        )
      ));

    it(`must trace custom error${suffix}`, () =>
      runTest('custom-error', useExpressPino, true, 'Custom error level message - should be traced.'));

    it(`must trace child logger error${suffix}`, () => {
      if (useExpressPino) {
        return;
      }
      return runTest('child-error', false, true, 'Child logger error message - should be traced.');
    });
  }

  function runTest(level, useExpressPino, expectErroneous, message) {
    return appControls.trigger(level, useExpressPino).then(() =>
      utils.retry(() =>
        agentControls.getSpans().then(spans => {
          const entrySpan = utils.expectOneMatching(spans, span => {
            expect(span.n).to.equal('node.http.server');
            expect(span.f.e).to.equal(String(appControls.getPid()));
            expect(span.f.h).to.equal('agent-stub-uuid');
          });
          utils.expectOneMatching(spans, span => {
            checkPinoSpan(span, entrySpan, expectErroneous, message);
          });
          utils.expectOneMatching(spans, span => {
            checkNextExitSpan(span, entrySpan);
          });
        })
      )
    );
  }

  function checkPinoSpan(span, parent, expectErroneous, message) {
    expect(span.t).to.equal(parent.t);
    expect(span.p).to.equal(parent.s);
    expect(span.k).to.equal(constants.EXIT);
    expect(span.f.e).to.equal(String(appControls.getPid()));
    expect(span.f.h).to.equal('agent-stub-uuid');
    expect(span.n).to.equal('log.pino');
    expect(span.async).to.equal(false);
    expect(span.error).to.equal(expectErroneous);
    expect(span.ec).to.equal(expectErroneous ? 1 : 0);
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
});
