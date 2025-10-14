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
  const AppControls = require('./controls');

  describe('Ensure that logger spans are created', () => {
    beforeEach(async () => {
      await agentControls.clearReceivedTraceData();
      await agentControls.clearAgentLogs();
    });

    describe('with a custom pino logger', () => {
      describe('set minimal pino configuration', function () {
        let appControls;

        beforeEach(async () => {
          appControls = new AppControls({
            instanaLoggingMode: 'receives-pino-logger',
            env: {
              CREATE_CUSTOM_LOG_SPANS: 'true'
            }
          });

          await appControls.start();
        });

        afterEach(() => {
          return appControls.stop();
        });

        it('log calls are traced', () => {
          verifyLogSpansAreCreated(appControls, {
            spanName: 'log.pino',
            expectedTimeFormat: 'time',
            expectedLevelFormat: 'level'
          });
        });
      });

      describe('set extended pino configuration', function () {
        let appControls;

        beforeEach(async () => {
          appControls = new AppControls({
            instanaLoggingMode: 'receives-pino-logger',
            pipeSubprocessLogs: true,
            env: {
              CREATE_CUSTOM_LOG_SPANS: 'true',
              EXTENDED_LOGGER_CONFIG: 'true'
            }
          });

          await appControls.start();
        });

        afterEach(() => {
          return appControls.stop();
        });

        it('log calls are traced', () =>
          verifyLogSpansAreCreated(appControls, {
            spanName: 'log.pino',
            expectedTimeFormat: '"@timestamp":',
            expectedLevelFormat: '"log.level":'
          }));
      });
    });
  });

  describe('Ensure that Instana logs are not being traced as log spans', () => {
    beforeEach(async () => {
      await agentControls.clearReceivedTraceData();
      await agentControls.clearAgentLogs();
    });

    describe('with the default logger', () => {
      let appControls;

      beforeEach(async () => {
        appControls = new AppControls({
          instanaLoggingMode: 'uses-default-logger'
        });

        await appControls.start();
      });

      afterEach(() => {
        return appControls.stop();
      });

      it('log calls are not traced', () => verifyInstanaLoggingIsNotTraced(appControls, { expectedAgentLogCount: 1 }));
    });

    describe('with a custom pino logger', () => {
      let appControls;

      beforeEach(async () => {
        appControls = new AppControls({
          instanaLoggingMode: 'receives-pino-logger'
        });

        await appControls.start();
      });

      afterEach(() => {
        return appControls.stop();
      });

      it('log calls are not traced', () => verifyInstanaLoggingIsNotTraced(appControls));
    });

    describe('with a custom dummy logger', () => {
      let appControls;

      beforeEach(async () => {
        appControls = new AppControls({
          instanaLoggingMode: 'receives-custom-dummy-logger'
        });

        await appControls.start();
      });

      afterEach(() => {
        return appControls.stop();
      });

      // Only bunyan and pino currently support agent log forwarding.
      // See https://jsw.ibm.com/browse/INSTA-59278
      it('log calls are not traced', () =>
        verifyInstanaLoggingIsNotTraced(appControls, { expectedAgentLogCount: 2, expectCustomLogs: false }));
    });

    describe('with a custom log4js logger', () => {
      let appControls;

      beforeEach(async () => {
        appControls = new AppControls({
          instanaLoggingMode: 'receives-log4js-logger'
        });

        await appControls.start();
      });

      afterEach(() => {
        return appControls.stop();
      });

      // Only bunyan and pino currently support agent log forwarding.
      // See https://jsw.ibm.com/browse/INSTA-59278
      it('log calls are not traced', () =>
        verifyInstanaLoggingIsNotTraced(appControls, { expectedAgentLogCount: 2, expectCustomLogs: false }));
    });

    describe('with a custom bunyan logger', () => {
      let appControls;

      beforeEach(async () => {
        appControls = new AppControls({
          instanaLoggingMode: 'receives-bunyan-logger'
        });

        await appControls.start();
      });

      afterEach(() => {
        return appControls.stop();
      });

      it('log calls are not traced', () => verifyInstanaLoggingIsNotTraced(appControls));
    });

    describe('with a custom winston logger', () => {
      let appControls;

      beforeEach(async () => {
        appControls = new AppControls({
          instanaLoggingMode: 'receives-winston-logger'
        });

        await appControls.start();
      });

      afterEach(() => {
        return appControls.stop();
      });

      it('log calls are not traced', () =>
        verifyInstanaLoggingIsNotTraced(appControls, { expectedAgentLogCount: 2, expectCustomLogs: false }));
    });
  });

  describe('Ensure that worker threads using the correct thread ID', () => {
    let controls;

    beforeEach(async () => {
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

    afterEach(async () => {
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

  function verifyLogSpansAreCreated(appControls, { spanName, expectedTimeFormat, expectedLevelFormat }) {
    return appControls.trigger('trigger').then(async () => {
      await testUtils.delay(500);

      return testUtils.retry(() =>
        agentControls.getSpans().then(async spans => {
          const processLogs = appControls.getProcessLogs();

          processLogs.forEach(msg => {
            // check if msg is in JSON format first
            if (msg.indexOf('{') === -1 || msg.indexOf('}') === -1) {
              return;
            }

            expect(msg).to.include(expectedTimeFormat);
            expect(msg).to.include(expectedLevelFormat);
          });

          // 1 x http span + 1 x log span
          expect(spans.length).to.be.at.least(2);

          testUtils.expectAtLeastOneMatching(spans, [
            span => expect(span.n).to.equal('node.http.server'),
            span => expect(span.f.e).to.equal(String(appControls.getPid())),
            span => expect(span.f.h).to.equal('agent-stub-uuid')
          ]);

          testUtils.expectAtLeastOneMatching(spans, [span => expect(span.n).to.equal(spanName)]);
        })
      );
    });
  }

  function verifyInstanaLoggingIsNotTraced(appControls, { expectedAgentLogCount = 3, expectCustomLogs = true } = {}) {
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
