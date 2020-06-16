'use strict';

const expect = require('chai').expect;
const path = require('path');

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const testUtils = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');

let agentControls;

describe('tracing/restore context', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  agentControls = require('../../../apps/agentStubControls');

  this.timeout(config.getTestTimeout());

  agentControls.registerTestHooks();

  [
    //
    'run',
    'run-promise',
    'enter-and-leave'
  ].forEach(apiVariant => {
    registerSuite(apiVariant);
  });

  function registerSuite(apiVariant) {
    describe(`restore context (${apiVariant})`, function() {
      const controls = new ProcessControls({
        appPath: path.join(__dirname, 'custom-queueing-app'),
        agentControls,
        port: 3222
      }).registerTestHooks();

      it(//
      `must capture spans after async context loss when context is manually restored ${apiVariant})`, () => {
        let url = `/${apiVariant}`;
        return controls
          .sendRequest({
            method: 'POST',
            path: url
          })
          .then(() => verify(url));
      });
    });
  }
});

function verify(url) {
  return testUtils.retry(() =>
    agentControls.getSpans().then(spans => {
      const httpEntry = testUtils.expectAtLeastOneMatching(spans, span => {
        expect(span.n).to.equal('node.http.server');
        expect(span.k).to.equal(constants.ENTRY);
        expect(span.p).to.not.exist;
        expect(span.data.http.method).to.equal('POST');
        expect(span.data.http.url).to.equal(url);
      });

      testUtils.expectAtLeastOneMatching(spans, span => {
        expect(span.n).to.equal('log.pino');
        expect(span.k).to.equal(constants.EXIT);
        expect(span.p).to.equal(httpEntry.s);
        expect(span.data.log.message).to.equal('Should be traced.');
      });
    })
  );
}
