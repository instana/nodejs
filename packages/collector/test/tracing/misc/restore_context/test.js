/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const expect = require('chai').expect;

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const { delay, expectAtLeastOneMatching, retry } = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');

const agentControls = globalAgent.instance;

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('tracing/restore context', function () {
  this.timeout(config.getTestTimeout());

  globalAgent.setUpCleanUpHooks();

  describe('tracing enabled', () => {
    const controls = new ProcessControls({
      dirname: __dirname,
      useGlobalAgent: true
    });
    ProcessControls.setUpHooks(controls);
    registerAllTests(controls, true);
  });

  describe('tracing disabled', () => {
    const controls = new ProcessControls({
      dirname: __dirname,
      useGlobalAgent: true,
      tracingEnabled: false
    });
    ProcessControls.setUpHooks(controls);
    registerAllTests(controls, false);
  });

  function registerAllTests(controls, tracingEnabled) {
    [
      //
      'run',
      'run-promise',
      'enter-and-leave'
    ].forEach(apiVariant => registerTest(controls, tracingEnabled, apiVariant));
  }

  function registerTest(controls, tracingEnabled, apiVariant) {
    it(
      `must capture spans after async context loss when context is manually restored (${apiVariant}, tracing ` +
        `enabled: ${tracingEnabled}))`,
      () => {
        const url = `/${apiVariant}`;
        return controls
          .sendRequest({
            method: 'POST',
            path: url
          })
          .then(response => verify(url, response, tracingEnabled));
      }
    );
  }

  function verify(url, response, tracingEnabled) {
    expect(response).to.equal('Done! ✅');
    if (tracingEnabled) {
      return verifySpans(url);
    } else {
      return verifyNoSpans();
    }
  }

  function verifySpans(url) {
    return retry(() =>
      agentControls.getSpans().then(spans => {
        const httpEntry = expectAtLeastOneMatching(spans, [
          span => expect(span.n).to.equal('node.http.server'),
          span => expect(span.k).to.equal(constants.ENTRY),
          span => expect(span.p).to.not.exist,
          span => expect(span.data.http.method).to.equal('POST'),
          span => expect(span.data.http.url).to.equal(url)
        ]);

        expectAtLeastOneMatching(spans, [
          span => expect(span.n).to.equal('log.pino'),
          span => expect(span.k).to.equal(constants.EXIT),
          span => expect(span.p).to.equal(httpEntry.s),
          span => expect(span.data.log.message).to.equal('Should be traced.')
        ]);
      })
    );
  }

  function verifyNoSpans() {
    return retry(async () => {
      await delay(500);
      const spans = await agentControls.getSpans();
      expect(spans.length).to.equal(0);
    });
  }
});
