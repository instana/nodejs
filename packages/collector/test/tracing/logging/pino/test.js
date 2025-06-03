/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const expect = require('chai').expect;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const constants = require('@instana/core').tracing.constants;
const config = require('../../../../../core/test/config');
const testUtils = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');

describe('tracing/logging/pino', function () {
  this.timeout(config.getTestTimeout());

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  ['latest', 'v8'].forEach(pinoVersion => {
    const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

    mochaSuiteFn(`pino@${pinoVersion}`, function () {
      runTests(pinoVersion, false);
      runTests(pinoVersion, true);
    });
  });

  function runTests(pinoVersion, useExpressPino) {
    const suffix = useExpressPino ? ' (express-pino)' : '';

    let controls;

    before(async () => {
      controls = new ProcessControls({
        dirname: __dirname,
        useGlobalAgent: true,
        env: {
          PINO_VERSION: pinoVersion
        }
      });

      await controls.startAndWaitForAgentConnection();
    });

    beforeEach(async () => {
      await agentControls.clearReceivedTraceData();
    });

    after(async () => {
      await controls.stop();
    });

    afterEach(async () => {
      await controls.clearIpcMessages();
    });

    it(`must not trace info${suffix}`, () =>
      trigger('info', useExpressPino, controls).then(() =>
        testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const entrySpan = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.f.e).to.equal(String(controls.getPid())),
              span => expect(span.f.h).to.equal('agent-stub-uuid')
            ]);
            testUtils.expectAtLeastOneMatching(spans, checkNextExitSpan(entrySpan, controls));
            const pinoSpans = testUtils.getSpansByName(spans, 'log.pino');
            expect(pinoSpans).to.be.empty;
          })
        )
      ));

    it('[suppressed] should not trace', async function () {
      await controls.sendRequest({
        method: 'GET',
        path: '/warn',
        suppressTracing: true
      });

      return testUtils
        .retry(() => testUtils.delay(1000))
        .then(() => agentControls.getSpans())
        .then(spans => {
          if (spans.length > 0) {
            expect.fail(`Unexpected spans ${testUtils.stringifyItems(spans)}.`);
          }
        });
    });

    it(`must trace warn${suffix}`, () =>
      runTest('warn', useExpressPino, false, 'Warn message - should be traced.', controls));

    it(`must trace error${suffix}`, () =>
      runTest('error', useExpressPino, true, 'Error message - should be traced.', controls));

    it(`must trace fatal${suffix}`, () =>
      runTest('fatal', useExpressPino, true, 'Fatal message - should be traced.', controls));

    // prettier-ignore
    it(`must trace error object without message${suffix}`, () =>
      runTest('error-object-only', useExpressPino, true, 'This is an error.', controls)
  );

    // prettier-ignore
    it(`should serialize random objects one level deep${suffix}`, () =>
      runTest(
        'error-random-object-only',
        useExpressPino,
        true,
        ['{ payload: ', 'statusCode: 404', "error: 'Not Found'", 'very: [Object'],
        controls
      )
  );

    // prettier-ignore
    it(`must trace error object and string${suffix}`, () =>
      runTest(
        'error-object-and-string',
        useExpressPino,
        true,
        'This is an error. -- Error message - should be traced.',
        controls
      )
);

    // prettier-ignore
    it(`must trace random object and string${suffix}`, () =>
      runTest('error-random-object-and-string', useExpressPino, true, 'Error message - should be traced.', controls)
  );

    it(`must not trace custom info${suffix}`, () =>
      trigger('custom-info', useExpressPino, controls).then(() =>
        testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const entrySpan = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.f.e).to.equal(String(controls.getPid())),
              span => expect(span.f.h).to.equal('agent-stub-uuid')
            ]);
            testUtils.expectAtLeastOneMatching(spans, checkNextExitSpan(entrySpan, controls));
            const pinoSpans = testUtils.getSpansByName(spans, 'log.pino');
            expect(pinoSpans).to.be.empty;
          })
        )
      ));

    it(`must trace custom error${suffix}`, () =>
      runTest('custom-error', useExpressPino, true, 'Custom error level message - should be traced.', controls));

    it(`must trace child logger error${suffix}`, () => {
      if (useExpressPino) {
        return;
      }
      return runTest('child-error', false, true, 'Child logger error message - should be traced.', controls);
    });
  }

  function runTest(level, useExpressPino, expectErroneous, message, controls) {
    return trigger(level, useExpressPino, controls).then(() =>
      testUtils.retry(() =>
        agentControls.getSpans().then(spans => {
          const entrySpan = testUtils.expectAtLeastOneMatching(spans, [
            span => expect(span.n).to.equal('node.http.server'),
            span => expect(span.f.e).to.equal(String(controls.getPid())),
            span => expect(span.f.h).to.equal('agent-stub-uuid')
          ]);

          testUtils.expectAtLeastOneMatching(spans, checkPinoSpan(entrySpan, expectErroneous, message, controls));
          testUtils.expectAtLeastOneMatching(spans, checkNextExitSpan(entrySpan, controls));

          // entry + exit + pino log
          // NOTE: Pino uses process.stdout directly
          //       Length of 3 just ensures that our console.* instrumentation isn't counted when customer uses pino
          expect(spans.length).to.eql(3);
        })
      )
    );
  }

  function trigger(level, useExpressPino, controls) {
    return controls.sendRequest({ path: `/${(useExpressPino ? 'express-pino-' : '') + level}` });
  }

  function checkPinoSpan(parent, expectErroneous, message, controls) {
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

  function checkNextExitSpan(parent, controls) {
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
