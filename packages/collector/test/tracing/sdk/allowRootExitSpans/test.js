/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const { expect } = require('chai');
const path = require('path');

const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('@instana/core/test/config');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');
const { retry, delay, expectExactlyOneMatching } = require('@instana/core/test/test_util');
const constants = require('@instana/core').tracing.constants;

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

// ATTENTION: starting the short living worker will already send out the span!
//            beforeEach will kick in afterwards and reset the spans! Do not use beforeEach!
// ATTENTION: the apps are dying directly and any timer in our tracer won't get triggered anymore
//            because the process is already dead and we are making use of `unref`.
mochaSuiteFn('tracing/sdk/rootExitSpans', function () {
  this.timeout(config.getTestTimeout());

  const agentControls = globalAgent.instance;
  globalAgent.setUpCleanUpHooks();

  afterEach(async () => {
    await agentControls.clearReceivedTraceData();
  });

  // an sdk entry span is wrapped to track the exit span
  describe('app with entry span', function () {
    let appControls;

    before(async () => {
      appControls = new ProcessControls({
        appPath: path.join(__dirname, 'app_with_entry'),
        useGlobalAgent: true
      });

      await appControls.start(null, null, true);
    });

    it('should collect entry and exit spans', async () => {
      await delay(200);

      await retry(async () => {
        const spans = await agentControls.getSpans();
        expect(spans.length).to.equal(2);

        const entrySpan = expectEntrySpan(appControls, spans);
        expectExitSpan(appControls, entrySpan, spans);
      }, 1000);
    });
  });

  // no sdk wrap present, exit span stands alone
  describe('app without entry span', function () {
    let appControls;

    before(async () => {
      appControls = new ProcessControls({
        appPath: path.join(__dirname, 'app_default'),
        useGlobalAgent: true
      });

      await appControls.start(null, null, true);
    });

    it('should trace only a single exit span', async () => {
      await delay(200);

      await retry(async () => {
        const spans = await agentControls.getSpans();
        expect(spans.length).to.equal(1);
        assertSingleExitSpan(spans);
      }, 1000);
    });
  });

  function expectEntrySpan(controls, spans) {
    const expectations = [
      span => expect(span.n).to.equal('sdk'),
      span => expect(span.p).to.not.exist,
      span => expect(span.k).to.equal(1),
      span => expect(span.f.e).to.equal(String(controls.getPid())),
      span => expect(span.f.h).to.equal('agent-stub-uuid'),
      span => expect(span.async).to.not.exist,
      span => expect(span.error).to.not.exist,
      span => expect(span.ec).to.equal(0)
    ];

    return expectExactlyOneMatching(spans, expectations);
  }

  function expectExitSpan(controls, entrySpan, spans) {
    const expectations = [
      span => expect(span.n).to.equal('node.http.client'),
      span => expect(span.p).to.equal(entrySpan.s),
      span => expect(span.k).to.equal(2),
      span => expect(span.f.e).to.equal(String(controls.getPid())),
      span => expect(span.f.h).to.equal('agent-stub-uuid'),
      span => expect(span.async).to.not.exist,
      span => expect(span.error).to.not.exist,
      span => expect(span.ec).to.equal(0)
    ];

    return expectExactlyOneMatching(spans, expectations);
  }

  function assertSingleExitSpan(spans) {
    expectExactlyOneMatching(spans, span => {
      expect(span.t).to.exist;
      expect(span.p).to.not.exist;
      expect(span.s).to.exist;
      expect(span.k).to.equal(constants.EXIT);
    });
  }
});
