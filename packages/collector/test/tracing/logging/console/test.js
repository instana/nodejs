/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const expect = require('chai').expect;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const testUtils = require('../../../../../core/test/test_util');
const {
  verifyHttpRootEntry,
  verifyHttpExit,
  verifyExitSpan
} = require('../../../../../core/test/test_util/common_verifications');
const globalAgent = require('../../../globalAgent');
const ProcessControls = require('../../../test_util/ProcessControls');

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('tracing/logging/console', function () {
  this.timeout(config.getTestTimeout());

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  let controls;

  before(async () => {
    controls = new ProcessControls({
      dirname: __dirname,
      useGlobalAgent: true
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

  /**
   * CASES/NOTES
   *
   * - external loggers such as bunyan or winston use process.stdout internally
   * - we internally use a logger component (e.g. logger.warn)
   *    - core uses console by default, but nobody is using core directly without config
   *    - collector uses bunyan by default (which then also will be used by customer)
   *      - process.stdout/stderr + raw/json forma
   *      - that means no risk by default
   *    - even if customer overrides the logger with 3rd party logger, there is no known no logger
   *      which uses console.* directly
   *      - exception: runtime is browser
   *      - e.g. https://github.com/trentm/node-bunyan/blob/master/lib/bunyan.js#L474)
   *  - in theory we as developers could put a console.* inside instrumentations,
   *    but they would not get tracked because the parent span would always be an exit span
   *      - e.g. bunyan -> logger.info -> our instrumentation uses console.warn -> parent span is exit span
   *  - serverless package uses a console logger
   *    - serverless is used by aws-lambda & customer use aws-lambda (not serverless)
   *    - aws-lambda initialises serverless before core
   *    - thats why serverless internal console logs are never instrumented
   *    - see test: aws-lambda/test/logging
   */
  describe('log calls', () => {
    it('must not trace info', () => runAndDoNotTrace('info'));
    it('must not trace log', () => runAndDoNotTrace('log'));
    it('must not trace debug', () => runAndDoNotTrace('debug'));
    it('must not trace 3rd party logger', () => runAndDoNotTrace('3rd-party-logger'));

    it('[suppression] must not trace', async () => {
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

    it('must trace warn', () => runAndTrace('warn', false, 'console.warn - should be traced', 'warn'));
    it('must trace error', () => runAndTrace('error', true, 'console.error - should be traced'));
    it('must trace timeout', () => runAndTrace('timeout', true, 'console.error - should be traced'));
    it('must trace exit span', () =>
      runAndTrace(
        'exit-span',
        true,
        'request to http://127.0.0.1:65212/ failed, reason: connect ' +
          'ECONNREFUSED 127.0.0.1:65212 -- console.error - should be traced'
      ));

    it('must trace an error object', () => runAndTrace('error-object', true, 'console.error - should be traced'));

    it('must not trace a random object', () =>
      runAndTrace(
        'random-object',
        true,
        "Log call without message. Call won't be serialized by Instana for performance reasons."
      ));

    it('must trace a random object with extra string field', () =>
      runAndTrace('random-object-with-extra-string-field', true, 'console.error - should be traced'));

    it("must trace an error object's message and an additional string field", () =>
      runAndTrace(
        'error-object-and-extra-string-field',
        true,
        'This is an error. -- console.error - should be traced'
      ));

    it("must trace a nested error object's message and an additional string", () =>
      runAndTrace(
        'nested-error-object-and-extra-string-field',
        true,
        'This is a nested error. -- console.error - should be traced'
      ));
  });

  describe('when logging is disabled', () => {
    describe('through environment variables', () => {
      let envVarControls;

      describe('using INSTANA_TRACING_DISABLE_INSTRUMENTATIONS', () => {
        before(async () => {
          envVarControls = new ProcessControls({
            useGlobalAgent: true,
            dirname: __dirname,
            env: {
              INSTANA_TRACING_DISABLE_INSTRUMENTATIONS: ['console']
            }
          });
          await envVarControls.startAndWaitForAgentConnection();
        });

        after(async () => {
          await envVarControls.stop();
        });

        it('should not trace console.warn calls', async () => {
          await envVarControls.sendRequest({ path: '/warn' });

          await testUtils.retry(async () => {
            const spans = await agentControls.getSpans();
            const httpEntrySpan = verifyHttpRootEntry({
              spans,
              apiPath: '/warn',
              pid: String(envVarControls.getPid())
            });

            verifyHttpExit({
              spans,
              parent: httpEntrySpan,
              pid: String(envVarControls.getPid())
            });

            const consoleLogSpans = testUtils.getSpansByName(spans, 'log.console');
            expect(consoleLogSpans).to.be.empty;
          });
        });
      });

      describe('using INSTANA_TRACING_DISABLE_GROUPS', () => {
        before(async () => {
          envVarControls = new ProcessControls({
            useGlobalAgent: true,
            dirname: __dirname,
            env: {
              INSTANA_TRACING_DISABLE_GROUPS: ['LOGGING']
            }
          });
          await envVarControls.startAndWaitForAgentConnection();
        });

        after(async () => {
          await envVarControls.stop();
        });

        it('should not trace console.warn calls', async () => {
          await envVarControls.sendRequest({ path: '/warn' });

          await testUtils.retry(async () => {
            const spans = await agentControls.getSpans();
            const httpEntrySpan = verifyHttpRootEntry({
              spans,
              apiPath: '/warn',
              pid: String(envVarControls.getPid())
            });

            verifyHttpExit({
              spans,
              parent: httpEntrySpan,
              pid: String(envVarControls.getPid())
            });

            const consoleLogSpans = testUtils.getSpansByName(spans, 'log.console');
            expect(consoleLogSpans).to.be.empty;
          });
        });
      });

      describe('using INSTANA_TRACING_DISABLE with value "logging"', () => {
        before(async () => {
          envVarControls = new ProcessControls({
            useGlobalAgent: true,
            dirname: __dirname,
            env: {
              INSTANA_TRACING_DISABLE: ['logging']
            }
          });
          await envVarControls.startAndWaitForAgentConnection();
        });

        after(async () => {
          await envVarControls.stop();
        });

        it('should not trace console.warn calls', async () => {
          await envVarControls.sendRequest({ path: '/warn' });

          await testUtils.retry(async () => {
            const spans = await agentControls.getSpans();
            const httpEntrySpan = verifyHttpRootEntry({
              spans,
              apiPath: '/warn',
              pid: String(envVarControls.getPid())
            });

            verifyHttpExit({
              spans,
              parent: httpEntrySpan,
              pid: String(envVarControls.getPid())
            });

            const consoleLogSpans = testUtils.getSpansByName(spans, 'log.console');
            expect(consoleLogSpans).to.be.empty;
          });
        });
      });
    });

    describe('through agent configuration', () => {
      describe('when logging group is disabled', () => {
        const { AgentStubControls } = require('../../../apps/agentStubControls');
        let customAgentControls;
        let agentConfigControls;

        before(async () => {
          customAgentControls = new AgentStubControls();
          await customAgentControls.startAgent({
            disable: { logging: true }
          });

          agentConfigControls = new ProcessControls({
            agentControls: customAgentControls,
            dirname: __dirname
          });
          await agentConfigControls.startAndWaitForAgentConnection();
        });

        after(async () => {
          await agentConfigControls.stop();
          await customAgentControls.stopAgent();
        });

        it('should not trace console.warn calls', async () => {
          await agentConfigControls.sendRequest({ path: '/warn' });

          await testUtils.retry(async () => {
            const spans = await customAgentControls.getSpans();
            const httpEntrySpan = verifyHttpRootEntry({
              spans,
              apiPath: '/warn',
              pid: String(agentConfigControls.getPid())
            });

            verifyHttpExit({
              spans,
              parent: httpEntrySpan,
              pid: String(agentConfigControls.getPid())
            });

            const consoleLogSpans = testUtils.getSpansByName(spans, 'log.console');
            expect(consoleLogSpans).to.be.empty;
          });
        });
      });

      describe('when logging is disabled but console is explicitly enabled', () => {
        const { AgentStubControls } = require('../../../apps/agentStubControls');
        let customAgentControls;
        let agentConfigControls;

        before(async () => {
          customAgentControls = new AgentStubControls();
          await customAgentControls.startAgent({
            disable: { logging: true, console: false }
          });

          agentConfigControls = new ProcessControls({
            agentControls: customAgentControls,
            dirname: __dirname
          });
          await agentConfigControls.startAndWaitForAgentConnection();
        });

        after(async () => {
          await agentConfigControls.stop();
          await customAgentControls.stopAgent();
        });

        it('should trace console.warn calls', async () => {
          await agentConfigControls.sendRequest({ path: '/warn' });

          await testUtils.retry(async () => {
            const spans = await customAgentControls.getSpans();
            const httpEntrySpan = verifyHttpRootEntry({
              spans,
              apiPath: '/warn',
              pid: String(agentConfigControls.getPid())
            });

            verifyHttpExit({
              spans,
              parent: httpEntrySpan,
              pid: String(agentConfigControls.getPid())
            });

            const consoleLogSpans = testUtils.getSpansByName(spans, 'log.console');
            expect(consoleLogSpans.length).to.equal(1);
          });
        });
      });
    });
  });

  function runAndDoNotTrace(url) {
    return controls.sendRequest({ path: `/${url}` }).then(() =>
      testUtils.retry(() =>
        agentControls.getSpans().then(spans => {
          const httpEntrySpan = verifyHttpRootEntry({
            spans,
            apiPath: `/${url}`,
            pid: String(controls.getPid())
          });

          verifyHttpExit({
            spans,
            parent: httpEntrySpan,
            pid: String(controls.getPid())
          });

          expect(testUtils.getSpansByName(spans, 'log.console')).to.be.empty;
        })
      )
    );
  }

  function runAndTrace(url, expectErroneous, message, level = 'error') {
    return controls.sendRequest({ path: `/${url}` }).then(() =>
      testUtils.retry(() =>
        agentControls.getSpans().then(spans => {
          const httpEntrySpan = verifyHttpRootEntry({
            spans,
            apiPath: `/${url}`,
            pid: String(controls.getPid())
          });

          verifyHttpExit({
            spans,
            parent: httpEntrySpan,
            pid: String(controls.getPid()),
            testMethod: testUtils.expectAtLeastOneMatching
          });

          verifyExitSpan({
            spanName: 'log.console',
            dataProperty: 'log',
            spans,
            parent: httpEntrySpan,
            withError: expectErroneous,
            pid: String(controls.getPid()),
            extraTests: [
              span => expect(span.data.log.message).to.equal(message),
              span => expect(span.data.log.level).to.equal(level)
            ]
          });

          expect(testUtils.getSpansByName(spans, 'log.console').length).to.equal(1);
        })
      )
    );
  }
});
