/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const expect = require('chai').expect;
const constants = require('@_local/core/src/tracing/constants');
const {
  retry,
  expectAtLeastOneMatching,
  getSpansByName,
  delay,
  stringifyItems
} = require('@_local/core/test/test_util');
const globalAgent = require('@_local/collector/test/globalAgent');
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');

module.exports = function (name, version, isLatest) {
  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  describe('trace log calls', () => {
    let controls;

    before(async () => {
      controls = new ProcessControls({
        dirname: __dirname,
        appName: 'bunyanApp',
        useGlobalAgent: true,
        env: {
          LIBRARY_LATEST: isLatest,
          LIBRARY_VERSION: version,
          LIBRARY_NAME: name
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

    it('must not trace info', () =>
      trigger('info', controls).then(() =>
        retry(() =>
          agentControls.getSpans().then(spans => {
            const entrySpan = expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.f.e).to.equal(String(controls.getPid())),
              span => expect(span.f.h).to.equal('agent-stub-uuid')
            ]);
            expectAtLeastOneMatching(spans, span => {
              checkNextExitSpan(span, entrySpan, controls);
            });
            const bunyanSpans = getSpansByName(spans, 'log.bunyan');
            expect(bunyanSpans).to.be.empty;
          })
        )
      ));

    it('must trace warn', () => runTest('warn', false, 'Warn message - should be traced.', controls));

    it('must trace error', () => runTest('error', true, 'Error message - should be traced.', controls));

    it('must trace fatal', () => runTest('fatal', true, 'Fatal message - should be traced.', controls));

    it("must capture an error object's message", () =>
      runTest('error-object-only', true, 'This is an error.', controls));

    it("must capture a nested error object's message", async () => {
      await runTest('nested-error-object-only', true, 'This is a nested error.', controls);
    });

    it('must serialize random object', () => runTest('error-random-object-only', true, '{"foo":"[Object]"}', controls));

    it('must serialize large object', () =>
      runTest(
        'error-large-object-only',
        true,
        // eslint-disable-next-line max-len
        '{"_id":"638dea148cff492d47e792ea","index":0,"guid":"01b61bfa-fe4c-4d75-9224-389c4c04de10","isActive":false,"balance":"$1,919.18","picture":"http://placehold.it/32x32","age":37,"eyeColor":"blue","name":"Manning Brady","gender":"male","company":"ZYTRAC","email":"manningbrady@zytrac.com","phone":"+1 (957) 538-2183","address":"146 Bushwick Court, Gilgo, New York, 2992","about":"Ullamco cillum reprehenderit eu proident veniam laboris tempor voluptate. Officia deserunt velit incididunt consequat la...',
        controls,
        500,
        3
      ));

    it("must capture an error object's message and an additional string", () =>
      runTest('error-object-and-string', true, 'This is an error. -- Error message - should be traced.', controls));

    it("must capture a nested error object's message and an additional string", () =>
      runTest(
        'nested-error-object-and-string',
        true,
        // eslint-disable-next-line max-len
        'This is a nested error. -- Error message - should be traced.',
        controls
      ));

    it('must trace random object and string', () =>
      runTest(
        'error-random-object-and-string',
        true,
        '{"foo":"[Object]"} - Error message - should be traced.',
        controls
      ));

    it('must trace child logger error', () =>
      runTest('child-error', true, 'Child logger error message - should be traced.', controls));

    it('[suppression] should not trace', async function () {
      await trigger('warn', controls, { 'X-INSTANA-L': '0' });

      return retry(() => delay(1000))
        .then(() => agentControls.getSpans())
        .then(spans => {
          if (spans.length > 0) {
            expect.fail(`Unexpected spans ${stringifyItems(spans)}.`);
          }
        });
    });
  });

  function runTest(url, expectErroneous, message, controls, lengthOfMessage, numberOfSpans) {
    return trigger(url, controls).then(async () => {
      return retry(async () => {
        const spans = await agentControls.getSpans();

        // entry + exit + bunyan log (+ fs call)
        // NOTE: Bunyan uses process.stdout directly
        //       Length of 3 just ensures that our console.* instrumentation isn't counted when customer uses Bunyan
        expect(spans.length).to.eql(numberOfSpans || 3);

        const entrySpan = expectAtLeastOneMatching(spans, [
          span => expect(span.n).to.equal('node.http.server'),
          span => expect(span.f.e).to.equal(String(controls.getPid())),
          span => expect(span.f.h).to.equal('agent-stub-uuid')
        ]);

        expectAtLeastOneMatching(spans, span => {
          checkBunyanSpan(span, entrySpan, expectErroneous, message, controls, lengthOfMessage);
        });

        expectAtLeastOneMatching(spans, span => {
          checkNextExitSpan(span, entrySpan, controls);
        });

        // verify that nothing logged by Instana has been traced
        const allBunyanSpans = getSpansByName(spans, 'log.bunyan');
        expect(allBunyanSpans.length).to.equal(1);
      });
    });
  }

  function checkBunyanSpan(span, parent, erroneous, message, controls, lengthOfMessage) {
    expect(span.t).to.equal(parent.t);
    expect(span.p).to.equal(parent.s);
    expect(span.k).to.equal(constants.EXIT);
    expect(span.f.e).to.equal(String(controls.getPid()));
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

  function checkNextExitSpan(span, parent, controls) {
    expect(span.t).to.equal(parent.t);
    expect(span.p).to.equal(parent.s);
    expect(span.k).to.equal(constants.EXIT);
    expect(span.f.e).to.equal(String(controls.getPid()));
    expect(span.f.h).to.equal('agent-stub-uuid');
    expect(span.n).to.equal('node.http.client');
  }

  function trigger(level, controls, headers = {}) {
    return controls.sendRequest({ path: `/${level}`, headers });
  }
};
