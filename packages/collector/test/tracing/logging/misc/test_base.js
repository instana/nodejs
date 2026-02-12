/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const path = require('path');
const expect = require('chai').expect;
const testUtils = require('@_local/core/test/test_util');
const globalAgent = require('@_local/collector/test/globalAgent');
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');

module.exports = function (name, version, isLatest) {
  const versionDir = path.join(__dirname, `_v${version}`);

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;
  const AppControls = require('./controls');

  describe('Ensure that logger spans are created', function () {
    beforeEach(async () => {
      await agentControls.clearReceivedTraceData();
      await agentControls.clearAgentLogs();
    });

    describe('with a custom pino logger', function () {
      describe('set minimal pino configuration', function () {
        let appControls;

        beforeEach(async () => {
          appControls = new AppControls({
            instanaLoggingMode: 'receives-pino-logger',
            versionDir,
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
          return verifyLogSpansAreCreated(appControls, {
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
            versionDir,
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

        it('log calls are traced', () => {
          return verifyLogSpansAreCreated(appControls, {
            spanName: 'log.pino',
            expectedTimeFormat: '"@timestamp":',
            expectedLevelFormat: '"log.level":'
          });
        });
      });
    });
  });

  describe('Ensure that Instana logs are not being traced as log spans', function () {
    beforeEach(async () => {
      await agentControls.clearReceivedTraceData();
      await agentControls.clearAgentLogs();
    });

    describe('with the default logger', function () {
      let appControls;

      beforeEach(async () => {
        appControls = new AppControls({
          instanaLoggingMode: 'uses-default-logger',
          versionDir
        });

        await appControls.start();
      });

      afterEach(() => {
        return appControls.stop();
      });

      it('log calls are not traced', () => {
        return verifyInstanaLoggingIsNotTraced(appControls, { expectedAgentLogCount: 1 });
      });
    });

    describe('with a custom pino logger', function () {
      let appControls;

      beforeEach(async () => {
        appControls = new AppControls({
          instanaLoggingMode: 'receives-pino-logger',
          versionDir
        });

        await appControls.start();
      });

      afterEach(() => {
        return appControls.stop();
      });

      it('log calls are not traced', () => {
        return verifyInstanaLoggingIsNotTraced(appControls);
      });
    });

    describe('with a custom dummy logger', function () {
      let appControls;

      beforeEach(async () => {
        appControls = new AppControls({
          instanaLoggingMode: 'receives-custom-dummy-logger',
          versionDir
        });

        await appControls.start();
      });

      afterEach(() => {
        return appControls.stop();
      });

      // Only bunyan and pino currently support agent log forwarding.
      // See https://jsw.ibm.com/browse/INSTA-59278
      it('log calls are not traced', () => {
        return verifyInstanaLoggingIsNotTraced(appControls, { expectedAgentLogCount: 2, expectCustomLogs: false });
      });
    });

    describe('with a custom log4js logger', function () {
      let appControls;

      beforeEach(async () => {
        appControls = new AppControls({
          instanaLoggingMode: 'receives-log4js-logger',
          versionDir
        });

        await appControls.start();
      });

      afterEach(() => {
        return appControls.stop();
      });

      // Only bunyan and pino currently support agent log forwarding.
      // See https://jsw.ibm.com/browse/INSTA-59278
      it('log calls are not traced', () => {
        return verifyInstanaLoggingIsNotTraced(appControls, { expectedAgentLogCount: 2, expectCustomLogs: false });
      });
    });

    describe('with a custom bunyan logger', function () {
      let appControls;

      beforeEach(async () => {
        appControls = new AppControls({
          instanaLoggingMode: 'receives-bunyan-logger',
          versionDir
        });

        await appControls.start();
      });

      afterEach(() => {
        return appControls.stop();
      });

      it('log calls are not traced', () => {
        return verifyInstanaLoggingIsNotTraced(appControls);
      });
    });

    describe('with a custom winston logger', function () {
      let appControls;

      beforeEach(async () => {
        appControls = new AppControls({
          instanaLoggingMode: 'receives-winston-logger',
          versionDir
        });

        await appControls.start();
      });

      afterEach(() => {
        return appControls.stop();
      });

      it('log calls are not traced', () => {
        return verifyInstanaLoggingIsNotTraced(appControls, { expectedAgentLogCount: 2, expectCustomLogs: false });
      });
    });
  });

  describe('Ensure that worker threads using the correct thread ID', function () {
    let controls;

    beforeEach(async () => {
      // NOTE: it could be that we will loose the worker spans,
      //       if we execute clearReceivedTraceData in beforeEach!
      await agentControls.clearReceivedTraceData();

      controls = new ProcessControls({
        dirname: __dirname,
        appName: 'app-threads',
        useGlobalAgent: true,
        pipeSubprocessLogs: true,
        env: {
          LIBRARY_LATEST: isLatest,
          LIBRARY_VERSION: version,
          LIBRARY_NAME: name,
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
          const agentLogs = await agentControls.getAgentLogs();

          // This is only to verify that there are any agent logs at all.
          expect(agentLogs.length).to.be.at.least(3);

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
};
