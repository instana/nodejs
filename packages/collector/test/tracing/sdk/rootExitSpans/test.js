/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const expect = require('chai').expect;
const path = require('path');
const semver = require('semver');

const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('@instana/core/test/config');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');
const { retry, delay, expectExactlyOneMatching } = require('@instana/core/test/test_util');
const constants = require('@instana/core').tracing.constants;

const mochaSuiteFn =
  supportedVersion(process.versions.node) && semver.gte(process.versions.node, '18.0.0') ? describe : describe.skip;

mochaSuiteFn('tracing/sdk/rootExitSpans', function () {
  this.timeout(config.getTestTimeout());

  globalAgent.setUpCleanUpHooks();

  beforeEach(async () => {
    await globalAgent.instance.clearReceivedTraceData();
  });

  // an sdk entry span is wrapped to track the exit span
  describe('app with entry span', function () {
    let appControls;
    const agentControls = globalAgent.instance;

    before(async () => {
      appControls = new ProcessControls({
        appPath: path.join(__dirname, 'app_with_entry'),
        useGlobalAgent: true
      });

      await appControls.start(null, null, true);
    });

    it('should collect spans including sdk wrap', async () => {
      await delay(100);

      await retry(async () => {
        const spans = await agentControls.getSpans();
        expect(spans.length).to.equal(2);

        const entrySpan = expectEntrySpan(appControls, spans);
        expectExitSpan(appControls, entrySpan, spans);
      });
    });
  });

  // no sdk wrap present, exit span stands alone
  describe('app without entry span', function () {
    let agentControls;

    before(async () => {
      agentControls = new ProcessControls({
        appPath: path.join(__dirname, 'app_default'),
        useGlobalAgent: true
      });

      await agentControls.start(null, null, true);
    });

    it('should trace single exit span only', async () => {
      await delay(100);

      await retry(async () => {
        const spans = await globalAgent.instance.getSpans();
        expect(spans.length).to.equal(1);
        expectExactlyOneMatching(spans, span => {
          expect(span.t).to.exist;
          expect(span.p).to.not.exist;
          expect(span.s).to.exist;
          expect(span.k).to.equal(constants.EXIT);
        });
      });
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
});
