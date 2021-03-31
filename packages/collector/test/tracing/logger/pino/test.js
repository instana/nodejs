/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const expect = require('chai').expect;

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const testUtils = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('tracing/logger/pino', function () {
  this.timeout(config.getTestTimeout());

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  const controls = new ProcessControls({
    dirname: __dirname,
    useGlobalAgent: true
  });
  ProcessControls.setUpHooks(controls);

  runTests(false);
  runTests(true);

  function runTests(useExpressPino) {
    const suffix = useExpressPino ? ' (express-pino)' : '';

    it(`must not trace info${suffix}`, () =>
      trigger('info', useExpressPino).then(() =>
        testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const entrySpan = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.f.e).to.equal(String(controls.getPid())),
              span => expect(span.f.h).to.equal('agent-stub-uuid')
            ]);
            testUtils.expectAtLeastOneMatching(spans, checkNextExitSpan(entrySpan));
            const pinoSpans = testUtils.getSpansByName(spans, 'log.pino');
            expect(pinoSpans).to.be.empty;
          })
        )
      ));

    it(`must trace warn${suffix}`, () => runTest('warn', useExpressPino, false, 'Warn message - should be traced.'));

    it(`must trace error${suffix}`, () => runTest('error', useExpressPino, true, 'Error message - should be traced.'));

    it(`must trace fatal${suffix}`, () => runTest('fatal', useExpressPino, true, 'Fatal message - should be traced.'));

    // prettier-ignore
    it(`must trace error object without message${suffix}`, () =>
      runTest('error-object-only', useExpressPino, true, 'This is an error.'));

    // prettier-ignore
    it(`should serialize random objects one level deep${suffix}`, () =>
      runTest(
        'error-random-object-only',
        useExpressPino,
        true,
        ['{ payload: ', 'statusCode: 404', "error: 'Not Found'", 'very: [Object']));

    // prettier-ignore
    it(`must trace error object and string${suffix}`, () =>
      runTest(
        'error-object-and-string',
        useExpressPino,
        true,
        'This is an error. -- Error message - should be traced.'
      ));

    // prettier-ignore
    it(`must trace random object and string${suffix}`, () =>
      runTest('error-random-object-and-string', useExpressPino, true, 'Error message - should be traced.'));

    it(`must not trace custom info${suffix}`, () =>
      trigger('custom-info', useExpressPino).then(() =>
        testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const entrySpan = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.f.e).to.equal(String(controls.getPid())),
              span => expect(span.f.h).to.equal('agent-stub-uuid')
            ]);
            testUtils.expectAtLeastOneMatching(spans, checkNextExitSpan(entrySpan));
            const pinoSpans = testUtils.getSpansByName(spans, 'log.pino');
            expect(pinoSpans).to.be.empty;
          })
        )
      ));

    // prettier-ignore
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
    return trigger(level, useExpressPino).then(() =>
      testUtils.retry(() =>
        agentControls.getSpans().then(spans => {
          const entrySpan = testUtils.expectAtLeastOneMatching(spans, [
            span => expect(span.n).to.equal('node.http.server'),
            span => expect(span.f.e).to.equal(String(controls.getPid())),
            span => expect(span.f.h).to.equal('agent-stub-uuid')
          ]);
          testUtils.expectAtLeastOneMatching(spans, checkPinoSpan(entrySpan, expectErroneous, message));
          testUtils.expectAtLeastOneMatching(spans, checkNextExitSpan(entrySpan));
        })
      )
    );
  }

  function trigger(level, useExpressPino) {
    return controls.sendRequest({ path: `/${(useExpressPino ? 'express-pino-' : '') + level}` });
  }

  function checkPinoSpan(parent, expectErroneous, message) {
    const expectations = [
      span => expect(span.t).to.equal(parent.t),
      span => expect(span.p).to.equal(parent.s),
      span => expect(span.k).to.equal(constants.EXIT),
      span => expect(span.f.e).to.equal(String(controls.getPid())),
      span => expect(span.f.h).to.equal('agent-stub-uuid'),
      span => expect(span.n).to.equal('log.pino'),
      span => expect(span.async).to.not.exist,
      span => expect(span.error).to.not.exist,
      span => expect(span.ec).to.equal(expectErroneous ? 1 : 0),
      span => expect(span.data).to.exist,
      span => expect(span.data.log).to.exist
    ];
    if (Array.isArray(message)) {
      message.forEach(messageSubstring =>
        expectations.push(span => expect(span.data.log.message).to.include(messageSubstring))
      );
    } else {
      expectations.push(span => expect(span.data.log.message).to.equal(message));
    }
    return expectations;
  }

  function checkNextExitSpan(parent) {
    return [
      span => expect(span.t).to.equal(parent.t),
      span => expect(span.p).to.equal(parent.s),
      span => expect(span.k).to.equal(constants.EXIT),
      span => expect(span.f.e).to.equal(String(controls.getPid())),
      span => expect(span.f.h).to.equal('agent-stub-uuid'),
      span => expect(span.n).to.equal('node.http.client')
    ];
  }
});
