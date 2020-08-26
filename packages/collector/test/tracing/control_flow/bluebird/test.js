'use strict';

const expect = require('chai').expect;

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const testUtils = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');

describe('tracing/bluebird', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  const agentControls = require('../../../apps/agentStubControls');

  this.timeout(config.getTestTimeout());

  agentControls.registerTestHooks();

  const bluebirdControls = new ProcessControls({
    dirname: __dirname,
    agentControls
  });
  bluebirdControls.registerTestHooks();

  check('/delayed');
  check('/combined');
  check('/rejected');
  check('/childPromise');
  check('/childPromiseWithChildSend');
  check('/childHttpCall');
  check('/map');
  check('/eventEmitterBased');

  function check(path, checker = defaultChecker) {
    it(`must trace: ${path}`, () =>
      // trigger tracing
      bluebirdControls
        .sendRequest({
          method: 'GET',
          path
        })

        // validate the data
        .then(spanContext =>
          testUtils
            .retry(() =>
              agentControls.getSpans().then(spans => {
                checker(spanContext, spans, path);
              })
            )

            // actionable error reporting
            .catch(error =>
              agentControls.getSpans().then(spans => {
                // eslint-disable-next-line no-console
                console.error(
                  'Span context %s does not match expectation.\n\nError: %s\n\nSpans: %s',
                  JSON.stringify(spanContext, 0, 2),
                  error,
                  JSON.stringify(spans, 0, 2)
                );
                return Promise.reject(error);
              })
            )
        ));
  }

  function defaultChecker(spanContext, spans, path) {
    const entrySpan = getEntrySpans(spans, path);
    expect(spanContext.t).to.equal(entrySpan.t);
    expect(spanContext.s).to.equal(entrySpan.s);
  }

  function getEntrySpans(spans, path) {
    return testUtils.expectAtLeastOneMatching(spans, span => {
      expect(span.p).to.equal(undefined);
      expect(span.n).to.equal('node.http.server');
      expect(span.k).to.equal(constants.ENTRY);
      expect(span.data.http.url).to.equal(path);
    });
  }
});
