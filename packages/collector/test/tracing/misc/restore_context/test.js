'use strict';

const expect = require('chai').expect;

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const testUtils = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');

const agentControls = globalAgent.instance;

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('tracing/restore context', function() {
  this.timeout(config.getTestTimeout());

  globalAgent.setUpCleanUpHooks();

  const controls = new ProcessControls({
    dirname: __dirname,
    useGlobalAgent: true,
    port: 3222
  });
  ProcessControls.setUpHooks(controls);

  [
    //
    'run',
    'run-promise',
    'enter-and-leave'
  ].forEach(apiVariant => registerSuite(apiVariant));

  function registerSuite(apiVariant) {
    describe('restore context', function() {
      it(//
      `must capture spans after async context loss when context is manually restored (${apiVariant}))`, () => {
        const url = `/${apiVariant}`;
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
      const httpEntry = testUtils.expectAtLeastOneMatching(spans, [
        span => expect(span.n).to.equal('node.http.server'),
        span => expect(span.k).to.equal(constants.ENTRY),
        span => expect(span.p).to.not.exist,
        span => expect(span.data.http.method).to.equal('POST'),
        span => expect(span.data.http.url).to.equal(url)
      ]);

      testUtils.expectAtLeastOneMatching(spans, [
        span => expect(span.n).to.equal('log.pino'),
        span => expect(span.k).to.equal(constants.EXIT),
        span => expect(span.p).to.equal(httpEntry.s),
        span => expect(span.data.log.message).to.equal('Should be traced.')
      ]);
    })
  );
}
