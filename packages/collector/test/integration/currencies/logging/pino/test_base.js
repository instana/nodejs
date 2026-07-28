/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const path = require('path');
const expect = require('chai').expect;
const semver = require('semver');
const supportedVersion = require('@_local/core').tracing.supportedVersion;
const constants = require('@_local/core').tracing.constants;
const config = require('@_local/core/test/config');
const testUtils = require('@_local/core/test/test_util');
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');
const globalAgent = require('@_local/collector/test/globalAgent');

module.exports = function (name, version, isLatest) {
  // Pino v10(latest) requires Node.js 20 or higher
  if (isLatest && semver.lt(process.versions.node, '20.0.0')) {
    return;
  }

  const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

  mochaSuiteFn(`tracing/logging/${name}@${version}`, function () {
    this.timeout(config.getTestTimeout());

    globalAgent.setUpCleanUpHooks();
    const agentControls = globalAgent.instance;

    describe('default', function () {
      runTests(version, false);
    });

    describe('with second pino version', function () {
      let controls;

      before(async () => {
        testUtils.runCommandSync('rm -rf node_modules', path.join(__dirname, 'lib'));

        testUtils.runCommandSync(
          'npm install --production --no-audit --no-package-lock --prefix ./',
          path.join(__dirname, 'lib')
        );

        controls = new ProcessControls({
          dirname: __dirname,
          useGlobalAgent: true,
          env: {
            LIBRARY_LATEST: isLatest,
            LIBRARY_VERSION: version,
            LIBRARY_NAME: name,
            PINO_EXPRESS: 'false',
            PINO_SECOND_VERSION: 'true'
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

      it('must trace error', () =>
        runTest({
          level: 'error',
          useExpressPino: false,
          expectErroneous: true,
          message: 'Error message - should be traced.',
          expectedLevel: 'error',
          controls,
          expectedSpans: 4
        }));
    });

    describe('with second pino instance', function () {
      let controls;

      before(async () => {
        controls = new ProcessControls({
          dirname: __dirname,
          useGlobalAgent: true,
          env: {
            LIBRARY_LATEST: isLatest,
            LIBRARY_VERSION: version,
            LIBRARY_NAME: name,
            PINO_EXPRESS: 'false',
            PINO_SECOND_INSTANCE: 'true'
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

      it('must trace error', () =>
        runTest({
          level: 'error',
          useExpressPino: false,
          expectErroneous: true,
          message: 'Error message - should be traced.',
          expectedLevel: 'error',
          controls,
          expectedSpans: 4
        }));
    });

    describe('with express-pino', function () {
      runTests(version, true);
    });

    describe('pino thread-stream worker', function () {
      let controls;

      before(async () => {
        controls = new ProcessControls({
          dirname: __dirname,
          useGlobalAgent: true,
          env: {
            LIBRARY_LATEST: isLatest,
            LIBRARY_VERSION: version,
            LIBRARY_NAME: name,
            PINO_WORKER_MODE: 'transport',
            PINO_EXPRESS: 'false',
            NODE_OPTIONS: `--require ${require.resolve('@_local/collector/src/immediate.js')}`,
            INSTANA_DISABLE_WORKER_THREADS: 'true'
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

      it('must trace without errors', async () => {
        await controls.sendRequest({
          method: 'GET',
          path: '/thread-stream-test'
        });
        await testUtils.delay(1000);
        const spans = await agentControls.getSpans();

        const logSpan = spans.find(s => s.n === 'log.pino');
        expect(logSpan).to.exist;
        expect(logSpan.data.log.message).to.equal('Pino worker test error log');
        expect(logSpan.data.log.level).to.equal('error');

        const httpSpan = spans.find(s => s.n === 'node.http.server');
        expect(httpSpan).to.exist;
        expect(httpSpan.data.http.path_tpl).to.equal('/thread-stream-test');
        expect(httpSpan.data.http.status).to.equal(200);

        expect(spans).to.have.lengthOf(2);
      });
    });

    describe('log span capture configuration via INSTANA_TRACING_CAPTURE_LOG_LEVEL', function () {
      runCaptureTests({
        captureLevel: 'error',
        traced: [
          ['error', true, 'Error message - should be traced.'],
          ['fatal', true, 'Fatal message - should be traced.']
        ],
        notTraced: ['warn', 'info']
      });

      runCaptureTests({
        captureLevel: 'info',
        traced: [
          ['info', false, 'Info message - must not be traced by default.'],
          ['warn', false, 'Warn message - should be traced.'],
          ['error', true, 'Error message - should be traced.'],
          ['fatal', true, 'Fatal message - should be traced.']
        ],
        notTraced: []
      });

      runCaptureTests({
        captureLevel: 'off',
        traced: [],
        notTraced: ['warn', 'info', 'error', 'fatal']
      });

      function runCaptureTests({ captureLevel, traced, notTraced }) {
        describe(`when INSTANA_TRACING_CAPTURE_LOG_LEVEL=${captureLevel}`, function () {
          let controls;

          before(async () => {
            controls = new ProcessControls({
              dirname: __dirname,
              useGlobalAgent: true,
              env: {
                INSTANA_TRACING_CAPTURE_LOG_LEVEL: captureLevel,
                LIBRARY_LATEST: isLatest,
                LIBRARY_VERSION: version,
                LIBRARY_NAME: name,
                PINO_EXPRESS: 'false'
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

          traced.forEach(([level, erroneous, message]) => {
            it(`should trace ${level}`, () =>
              runTest({
                level,
                useExpressPino: false,
                expectErroneous: erroneous,
                message,
                expectedLevel: level,
                controls
              }));
          });

          notTraced.forEach(level => {
            it(`should not trace ${level}`, () =>
              trigger(level, false, controls).then(() =>
                testUtils.retry(() =>
                  agentControls.getSpans().then(spans => {
                    const entrySpan = testUtils.expectAtLeastOneMatching(spans, [
                      span => expect(span.n).to.equal('node.http.server'),
                      span => expect(span.f.e).to.equal(String(controls.getPid())),
                      span => expect(span.f.h).to.equal('agent-stub-uuid')
                    ]);

                    testUtils.expectAtLeastOneMatching(spans, checkNextExitSpan(entrySpan, controls));

                    expect(testUtils.getSpansByName(spans, 'log.pino')).to.be.empty;
                  })
                )
              ));
          });
        });
      }
    });

    function runTests(pinoVersion, useExpressPino) {
      const suffix = useExpressPino ? ' (express-pino)' : '';

      let controls;

      before(async () => {
        controls = new ProcessControls({
          dirname: __dirname,
          useGlobalAgent: true,
          env: {
            LIBRARY_LATEST: isLatest,
            LIBRARY_VERSION: version,
            LIBRARY_NAME: name,
            PINO_EXPRESS: useExpressPino ? 'true' : 'false'
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

      it(`must trace warn${suffix}`, () => runTest({ level: 'warn', useExpressPino, expectErroneous: false, message: 'Warn message - should be traced.', expectedLevel: 'warn', controls }));

      it(`must trace error${suffix}`, () => runTest({ level: 'error', useExpressPino, expectErroneous: true, message: 'Error message - should be traced.', expectedLevel: 'error', controls }));

      it(`must trace fatal${suffix}`, () => runTest({ level: 'fatal', useExpressPino, expectErroneous: true, message: 'Fatal message - should be traced.', expectedLevel: 'fatal', controls }));

      it(`must trace error object without message${suffix}`, () => runTest({ level: 'error-object-only', useExpressPino, expectErroneous: true, message: 'This is an error.', expectedLevel: 'error', controls }));

      it(`should serialize random objects one level deep${suffix}`, () =>
        runTest({
          level: 'error-random-object-only',
          useExpressPino,
          expectErroneous: true,
          message: ['{ payload: ', 'statusCode: 404', "error: 'Not Found'", 'very: [Object'],
          expectedLevel: 'error',
          controls
        }));

      it(`must trace error object and string${suffix}`, () =>
        runTest({
          level: 'error-object-and-string',
          useExpressPino,
          expectErroneous: true,
          message: 'This is an error. -- Error message - should be traced.',
          expectedLevel: 'error',
          controls
        }));

      it(`must trace random object and string${suffix}`, () => runTest({ level: 'error-random-object-and-string', useExpressPino, expectErroneous: true, message: 'Error message - should be traced.', expectedLevel: 'error', controls }));

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

      it(`must trace custom error${suffix}`, () => runTest({ level: 'custom-error', useExpressPino, expectErroneous: true, message: 'Custom error level message - should be traced.', expectedLevel: 'error', controls }));

      it(`must trace child logger error${suffix}`, () => {
        if (useExpressPino) {
          return;
        }
        return runTest({
          level: 'child-error',
          useExpressPino: false,
          expectErroneous: true,
          message: 'Child logger error message - should be traced.',
          expectedLevel: 'error',
          controls
        });
      });
    }

    function runTest({ level, useExpressPino, expectErroneous, message, expectedLevel, controls, expectedSpans = 3 }) {
      return trigger(level, useExpressPino, controls).then(() =>
        testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const entrySpan = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.f.e).to.equal(String(controls.getPid())),
              span => expect(span.f.h).to.equal('agent-stub-uuid')
            ]);

            testUtils.expectAtLeastOneMatching(
              spans,
              checkPinoSpan(entrySpan, expectErroneous, message, expectedLevel, controls)
            );
            testUtils.expectAtLeastOneMatching(spans, checkNextExitSpan(entrySpan, controls));

            // entry + exit + pino log
            // NOTE: Pino uses process.stdout directly
            //       Length of 3 just ensures that our console.* instrumentation isn't counted when customer uses pino
            expect(spans.length).to.eql(expectedSpans);
          })
        )
      );
    }

    function trigger(level, useExpressPino, controls) {
      return controls.sendRequest({ path: `/${(useExpressPino ? 'express-pino-' : '') + level}` });
    }

    function checkPinoSpan(parent, expectErroneous, message, expectedLevel, controls) {
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
      expectations.push(span => expect(span.data.log.level).to.equal(expectedLevel));
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
};
