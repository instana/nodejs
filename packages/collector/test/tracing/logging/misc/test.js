/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const expect = require('chai').expect;
const path = require('path');
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const testUtils = require('../../../../../core/test/test_util');
const globalAgent = require('../../../globalAgent');
const ProcessControls = require('../../../test_util/ProcessControls');

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('tracing/logging/misc', function () {
  this.timeout(config.getTestTimeout());

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;
  const appControls = require('./controls');

  describe('Ensure that Instana logs are not being traced as log spans', () => {
    beforeEach(async () => {
      await agentControls.clearReceivedTraceData();
      await agentControls.clearAgentLogs();
    });

    describe('with the default logger', () => {
      appControls.registerTestHooks({
        instanaLoggingMode: 'uses-default-logger'
      });

      it('log calls are not traced', () => verifyInstanaLoggingIsNotTraced({ expectedAgentLogCount: 1 }));
    });

    describe('with a custom pino logger', () => {
      appControls.registerTestHooks({
        instanaLoggingMode: 'receives-pino-logger'
      });

      it('log calls are not traced', () => verifyInstanaLoggingIsNotTraced());
    });

    describe('with a custom dummy logger', () => {
      appControls.registerTestHooks({
        instanaLoggingMode: 'receives-custom-dummy-logger'
      });

      // Only bunyan and pino currently support agent log forwarding.
      // See https://jsw.ibm.com/browse/INSTA-59278
      it('log calls are not traced', () =>
        verifyInstanaLoggingIsNotTraced({ expectedAgentLogCount: 2, expectCustomLogs: false }));
    });

    describe('with a custom log4js logger', () => {
      appControls.registerTestHooks({
        instanaLoggingMode: 'receives-log4js-logger'
      });

      // Only bunyan and pino currently support agent log forwarding.
      // See https://jsw.ibm.com/browse/INSTA-59278
      it('log calls are not traced', () =>
        verifyInstanaLoggingIsNotTraced({ expectedAgentLogCount: 2, expectCustomLogs: false }));
    });

    describe('with a custom bunyan logger', () => {
      appControls.registerTestHooks({
        instanaLoggingMode: 'receives-bunyan-logger'
      });

      it('log calls are not traced', () => verifyInstanaLoggingIsNotTraced());
    });

    describe('with a custom winston logger', () => {
      appControls.registerTestHooks({
        instanaLoggingMode: 'receives-winston-logger'
      });

      it('log calls are not traced', () =>
        verifyInstanaLoggingIsNotTraced({ expectedAgentLogCount: 2, expectCustomLogs: false }));
    });
  });

  describe('Ensure that worker threads using the correct thread ID', () => {
    let controls;

    before(async () => {
      // NOTE: it could be that we will loose the worker spans,
      //       if we execute clearReceivedTraceData in beforeEach!
      await agentControls.clearReceivedTraceData();

      controls = new ProcessControls({
        appPath: path.join(__dirname, 'app-threads.js'),
        useGlobalAgent: true,
        pipeSubprocessLogs: true,
        env: {
          // NOTE: ProcessControls default log level is 'warn' to not flood the test output.
          //       Force level info to assert against the threadId.
          INSTANA_LOG_LEVEL: 'info'
        }
      });

      await controls.startAndWaitForAgentConnection();
    });

    after(async () => {
      await controls.stop();
    });

    it('Expect correct thread ids', async () => {
      return testUtils.retry(async () => {
        const spans = await agentControls.getSpans();
        expect(spans.length).to.equal(2);

        let minimumOneAssert = false;
        controls.getProcessLogs().forEach(msg => {
          if (msg.indexOf('level') !== -1) {
            // threadId 0 is always the main thread.
            expect(msg).to.contain('"threadId":1');
            minimumOneAssert = true;
          }
        });

        expect(minimumOneAssert).to.be.true;
      }, 1000);
    });
  });

  function verifyInstanaLoggingIsNotTraced({ expectedAgentLogCount = 3, expectCustomLogs = true } = {}) {
    return appControls.trigger('trigger').then(async () => {
      await testUtils.delay(500);

      return testUtils.retry(() =>
        agentControls.getSpans().then(async spans => {
          const agentLogs = await agentControls.getAgentLogs();

          // See See https://jsw.ibm.com/browse/INSTA-24679
          // We actually only expect the error log to appear, but setLogger is broken by design.
          expect(agentLogs.length).to.equal(expectedAgentLogCount);

          if (expectCustomLogs) {
            expect(
              agentLogs.find(log => {
                return log.m.includes('An error logged by Instana - this must not be traced');
              })
            ).to.exist;
          }

          testUtils.expectAtLeastOneMatching(spans, [
            span => expect(span.n).to.equal('node.http.server'),
            span => expect(span.f.e).to.equal(String(appControls.getPid())),
            span => expect(span.f.h).to.equal('agent-stub-uuid')
          ]);

          // 1 x http span
          expect(spans.length).to.be.eq(1);

          // verify that nothing logged by Instana has been traced
          const allPinoSpans = testUtils.getSpansByName(spans, 'log.pino');
          expect(allPinoSpans).to.be.empty;

          // verify that nothing logged by Instana has been traced with bunyan
          const allBunyanSpans = testUtils.getSpansByName(spans, 'log.bunyan');
          expect(allBunyanSpans).to.be.empty;

          // verify that nothing logged by Instana has been traced with winston
          const allWinstonSpans = testUtils.getSpansByName(spans, 'log.winston');
          expect(allWinstonSpans).to.be.empty;

          // verify that nothing logged by Instana has been traced with log4js
          const allLog4jsSpans = testUtils.getSpansByName(spans, 'log.log4js');
          expect(allLog4jsSpans).to.be.empty;
        })
      );
    });
  }
});
