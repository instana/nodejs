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

mochaSuiteFn('tracing/instana-logger', function () {
  this.timeout(config.getTestTimeout());

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;
  const appControls = require('./controls');

  beforeEach(async () => {
    await agentControls.clearReceivedTraceData();
  });

  // verify that Instana's own pino logging does not get traced
  describe('do not trace Instana log calls', () => {
    describe('Instana creates a new default logger', () => {
      appControls.registerTestHooks({
        instanaLoggingMode: 'instana-uses-default-logger'
      });

      it('log calls are not traced', () => verifyInstanaLoggingIsNotTraced());
    });

    describe('Instana receives a pino logger', () => {
      appControls.registerTestHooks({
        instanaLoggingMode: 'instana-receives-pino-logger'
      });

      it('log calls are not traced', () => verifyInstanaLoggingIsNotTraced());
    });

    describe('Instana receives a custom dummy logger', () => {
      appControls.registerTestHooks({
        instanaLoggingMode: 'instana-receives-custom-dummy-logger'
      });

      it('log calls are not traced', () => verifyInstanaLoggingIsNotTraced());
    });

    describe('Instana receives a log4js logger', () => {
      appControls.registerTestHooks({
        instanaLoggingMode: 'instana-receives-log4js-logger'
      });

      it('log calls are not traced', () => verifyInstanaLoggingIsNotTraced());
    });

    describe('Instana receives a bunyan logger', () => {
      appControls.registerTestHooks({
        instanaLoggingMode: 'instana-receives-bunyan-logger'
      });

      it('log calls are not traced', () => verifyInstanaLoggingIsNotTraced());
    });

    describe('Instana receives a winston logger', () => {
      appControls.registerTestHooks({
        instanaLoggingMode: 'instana-receives-winston-logger'
      });

      it('log calls are not traced', () => verifyInstanaLoggingIsNotTraced());
    });
  });

  describe('Instana logger & worker threads', () => {
    let controls;

    before(async () => {
      controls = new ProcessControls({
        appPath: path.join(__dirname, 'app-instana-threads.js'),
        useGlobalAgent: true,
        env: {
          INSTANA_LOG_LEVEL: 'debug',
          WITH_FULL_STDIO: 'true'
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

    it('Expect correct thread ids', async () => {
      return testUtils
        .retry(() => testUtils.delay(5 * 1000))
        .then(() => agentControls.getSpans())
        .then(spans => {
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
        });
    });
  });

  function verifyInstanaLoggingIsNotTraced() {
    return appControls.trigger('trigger').then(async () => {
      await testUtils.delay(500);

      return testUtils.retry(() =>
        agentControls.getSpans().then(spans => {
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
