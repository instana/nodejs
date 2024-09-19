/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const expect = require('chai').expect;
const path = require('path');

const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('@instana/core/test/config');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');
const { retry, delay, expectExactlyOneMatching } = require('@instana/core/test/test_util');
const constants = require('@instana/core').tracing.constants;

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('tracing/sdk/rootExitSpans', function () {
  this.timeout(config.getTestTimeout());

  globalAgent.setUpCleanUpHooks();

  beforeEach(async () => {
    await globalAgent.instance.clearReceivedTraceData();
  });

  // an sdk entry span is wrapped to track the exit span
  // TODO: revisit to update the span assertions
  describe('APP WITH ENTRY SPAN', function () {
    let agentControls;

    before(async () => {
      agentControls = new ProcessControls({
        appPath: path.join(__dirname, 'app_with_entry'),
        useGlobalAgent: true
      });

      await agentControls.start(null, null, true);
    });

    after(async () => {
      await agentControls.stop();
    });

    it('should collect spans including sdk wrap', async () => {
      await delay(100);

      await retry(
        async () => {
          const spans = await globalAgent.instance.getSpans();
          expect(spans.length).to.equal(2);
          expectExactlyOneMatching(spans, span => {
            expect(span.p).to.exist;
            expect(span.k).to.equal(constants.EXIT);
          });
        },
        null,
        null,
        2
      );
    });
  });

  // no sdk wrap present, exit span stands alone
  describe('APP WITHOUT ENTRY SPAN', function () {
    let agentControls;

    before(async () => {
      agentControls = new ProcessControls({
        appPath: path.join(__dirname, 'app_default'),
        useGlobalAgent: true
      });

      await agentControls.start(null, null, true);
    });

    after(async () => {
      await agentControls.stop();
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
});
