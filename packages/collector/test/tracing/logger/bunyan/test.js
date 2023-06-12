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
const globalAgent = require('../../../globalAgent');

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('tracing/logger/bunyan', function () {
  this.timeout(config.getTestTimeout());

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  const appControls = require('./controls');

  describe('trace log calls', () => {
    appControls.registerTestHooks();

    beforeEach(() => agentControls.waitUntilAppIsCompletelyInitialized(appControls.getPid()));

    it('must not trace info', () =>
      appControls.trigger('info').then(() =>
        testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const entrySpan = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.f.e).to.equal(String(appControls.getPid())),
              span => expect(span.f.h).to.equal('agent-stub-uuid')
            ]);
            testUtils.expectAtLeastOneMatching(spans, span => {
              checkNextExitSpan(span, entrySpan);
            });
            const bunyanSpans = testUtils.getSpansByName(spans, 'log.bunyan');
            expect(bunyanSpans).to.be.empty;
          })
        )
      ));

    it('must trace warn', () => runTest('warn', false, 'Warn message - should be traced.'));

    it('must trace error', () => runTest('error', true, 'Error message - should be traced.'));

    it('must trace fatal', () => runTest('fatal', true, 'Fatal message - should be traced.'));

    it("must capture an error object's message", () => runTest('error-object-only', true, 'This is an error.'));

    it("must capture a nested error object's message", () =>
      runTest('nested-error-object-only', true, 'This is a nested error.'));

    it('must serialize random object', () => runTest('error-random-object-only', true, '{"foo":"[Object]"}'));

    it('must serialize large object', () =>
      runTest(
        'error-large-object-only',
        true,
        // eslint-disable-next-line max-len
        '{"_id":"638dea148cff492d47e792ea","index":0,"guid":"01b61bfa-fe4c-4d75-9224-389c4c04de10","isActive":false,"balance":"$1,919.18","picture":"http://placehold.it/32x32","age":37,"eyeColor":"blue","name":"Manning Brady","gender":"male","company":"ZYTRAC","email":"manningbrady@zytrac.com","phone":"+1 (957) 538-2183","address":"146 Bushwick Court, Gilgo, New York, 2992","about":"Ullamco cillum reprehenderit eu proident veniam laboris tempor voluptate. Officia deserunt velit incididunt consequat la...',
        500,
        4
      ));

    it("must capture an error object's message and an additional string", () =>
      runTest('error-object-and-string', true, 'This is an error. -- Error message - should be traced.'));

    it("must capture a nested error object's message and an additional string", () =>
      runTest('nested-error-object-and-string', true, 'This is a nested error. -- Error message - should be traced.'));

    it('must trace random object and string', () =>
      runTest('error-random-object-and-string', true, '{"foo":"[Object]"} - Error message - should be traced.'));

    it('must trace child logger error', () =>
      runTest('child-error', true, 'Child logger error message - should be traced.'));

    it('[suppression] should not trace', async function () {
      await appControls.trigger('warn', { 'X-INSTANA-L': '0' });

      return testUtils
        .retry(() => testUtils.delay(config.getTestTimeout() / 4))
        .then(() => agentControls.getSpans())
        .then(spans => {
          if (spans.length > 0) {
            expect.fail(`Unexpected spans ${testUtils.stringifyItems(spans)}.`);
          }
        });
    });
  });

  // verify that Instana's own Bunyan logging does not get traced
  describe('do not trace Instana log calls', () => {
    describe('Instana creates a new Bunyan logger', () => {
      appControls.registerTestHooks({
        instanaLoggingMode: 'instana-creates-bunyan-logger'
      });

      beforeEach(() => agentControls.waitUntilAppIsCompletelyInitialized(appControls.getPid()));

      it('log calls are not traced', () => verifyInstanaLoggingIsNotTraced());
    });

    describe('Instana receives a Bunyan logger', () => {
      appControls.registerTestHooks({
        instanaLoggingMode: 'instana-receives-bunyan-logger'
      });

      beforeEach(() => agentControls.waitUntilAppIsCompletelyInitialized(appControls.getPid()));

      it('log calls are not traced', () => verifyInstanaLoggingIsNotTraced());
    });

    describe('Instana receives a non-Bunyan logger', () => {
      appControls.registerTestHooks({
        instanaLoggingMode: 'instana-receives-non-bunyan-logger'
      });

      beforeEach(() => agentControls.waitUntilAppIsCompletelyInitialized(appControls.getPid()));

      it('log calls are not traced', () => verifyInstanaLoggingIsNotTraced());
    });
  });

  function runTest(url, expectErroneous, message, lengthOfMessage, numberOfSpans) {
    return appControls.trigger(url).then(() =>
      testUtils.retry(() =>
        agentControls.getSpans().then(spans => {
          const entrySpan = testUtils.expectAtLeastOneMatching(spans, [
            span => expect(span.n).to.equal('node.http.server'),
            span => expect(span.f.e).to.equal(String(appControls.getPid())),
            span => expect(span.f.h).to.equal('agent-stub-uuid')
          ]);
          testUtils.expectAtLeastOneMatching(spans, span => {
            checkBunyanSpan(span, entrySpan, expectErroneous, message, lengthOfMessage);
          });
          testUtils.expectAtLeastOneMatching(spans, span => {
            checkNextExitSpan(span, entrySpan);
          });

          // verify that nothing logged by Instana has been traced
          const allBunyanSpans = testUtils.getSpansByName(spans, 'log.bunyan');
          expect(allBunyanSpans.length).to.equal(1);

          // entry + exit + bunyan log (+ fs call)
          // NOTE: Bunyan uses process.stdout directly
          //       Length of 3 just ensures that our console.* instrumentation isn't counted when customer uses Bunyan
          expect(spans.length).to.eql(numberOfSpans || 3);
        })
      )
    );
  }

  function checkBunyanSpan(span, parent, erroneous, message, lengthOfMessage) {
    expect(span.t).to.equal(parent.t);
    expect(span.p).to.equal(parent.s);
    expect(span.k).to.equal(constants.EXIT);
    expect(span.f.e).to.equal(String(appControls.getPid()));
    expect(span.f.h).to.equal('agent-stub-uuid');
    expect(span.n).to.equal('log.bunyan');
    expect(span.async).to.not.exist;
    expect(span.error).to.not.exist;
    expect(span.ec).to.equal(erroneous ? 1 : 0);
    expect(span.data).to.exist;
    expect(span.data.log).to.exist;
    expect(span.data.log.message).to.equal(message);

    if (lengthOfMessage) {
      expect(span.data.log.message.length).to.equal(lengthOfMessage);
    }
  }

  function checkNextExitSpan(span, parent) {
    expect(span.t).to.equal(parent.t);
    expect(span.p).to.equal(parent.s);
    expect(span.k).to.equal(constants.EXIT);
    expect(span.f.e).to.equal(String(appControls.getPid()));
    expect(span.f.h).to.equal('agent-stub-uuid');
    expect(span.n).to.equal('node.http.client');
  }

  function verifyInstanaLoggingIsNotTraced() {
    return appControls.trigger('trigger').then(() =>
      testUtils.retry(() =>
        agentControls.getSpans().then(spans => {
          testUtils.expectAtLeastOneMatching(spans, [
            span => expect(span.n).to.equal('node.http.server'),
            span => expect(span.f.e).to.equal(String(appControls.getPid())),
            span => expect(span.f.h).to.equal('agent-stub-uuid')
          ]);

          // verify that nothing logged by Instana has been traced
          const allBunyanSpans = testUtils.getSpansByName(spans, 'log.bunyan');
          expect(allBunyanSpans).to.be.empty;
        })
      )
    );
  }
});
