/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const expect = require('chai').expect;

const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const testUtils = require('../../../../../core/test/test_util');
const globalAgent = require('../../../globalAgent');

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('tracing/instana-logger', function () {
  this.timeout(config.getTestTimeout());

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;
  const appControls = require('./controls');

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

    describe('Instana receives a non-pino logger', () => {
      appControls.registerTestHooks({
        instanaLoggingMode: 'instana-receives-custom-dummy-logger'
      });

      it('log calls are not traced', () => verifyInstanaLoggingIsNotTraced());
    });

    describe('Instana receives a bunyan logger', () => {
      appControls.registerTestHooks({
        instanaLoggingMode: 'instana-receives-bunyan-logger'
      });

      it('log calls are not traced', () => verifyInstanaLoggingIsNotTraced());

      it('bunyan calls should be traced', () => verifyNonInstanaLoggingIsTraced());
    });
  });

  function verifyInstanaLoggingIsNotTraced() {
    return appControls.trigger('trigger').then(() => {
      testUtils.delay(250);

      testUtils.retry(() =>
        agentControls.getSpans().then(spans => {
          testUtils.expectAtLeastOneMatching(spans, [
            span => expect(span.n).to.equal('node.http.server'),
            span => expect(span.f.e).to.equal(String(appControls.getPid())),
            span => expect(span.f.h).to.equal('agent-stub-uuid')
          ]);

          // verify that nothing logged by Instana has been traced
          const allPinoSpans = testUtils.getSpansByName(spans, 'log.pino');
          expect(allPinoSpans).to.be.empty;
        })
      );
    });
  }

  function verifyNonInstanaLoggingIsTraced() {
    return appControls.trigger('trigger').then(() => {
      testUtils.delay(250);

      testUtils.retry(() =>
        agentControls.getSpans().then(spans => {
          testUtils.expectAtLeastOneMatching(spans, [
            span => expect(span.n).to.equal('node.http.server'),
            span => expect(span.f.e).to.equal(String(appControls.getPid())),
            span => expect(span.f.h).to.equal('agent-stub-uuid')
          ]);

          const allBunyanSpans = testUtils.getSpansByName(spans, 'log.bunyan');
          expect(allBunyanSpans.length).to.be.greaterThan(0);
        })
      );
    });
  }
});
