/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const expect = require('chai').expect;

const constants = require('@_local/core').tracing.constants;
const supportedVersion = require('@_local/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const testUtils = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('tracing/native-promise', function () {
  this.timeout(config.getTestTimeout());

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;
  let promiseControls;

  before(async () => {
    promiseControls = new ProcessControls({
      dirname: __dirname,
      useGlobalAgent: true
    });

    await promiseControls.startAndWaitForAgentConnection();
  });

  beforeEach(async () => {
    await agentControls.clearReceivedTraceData();
  });

  after(async () => {
    await promiseControls.stop();
  });

  afterEach(async () => {
    await promiseControls.clearIpcMessages();
  });

  check('/delayed');
  check('/combined');
  check('/rejected');
  check('/childPromise');
  check('/childPromiseWithChildSend');
  check('/childHttpCall');
  check('/eventEmitterBased');

  function check(path, checker = defaultChecker) {
    it(`must trace: ${path}`, () =>
      // trigger tracing
      promiseControls
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
    const entrySpan = getEntySpan(spans, path);
    expect(spanContext.t).to.equal(entrySpan.t);
    expect(spanContext.s).to.equal(entrySpan.s);
  }

  function getEntySpan(spans, path) {
    return testUtils.expectAtLeastOneMatching(spans, [
      span => expect(span.p).to.equal(undefined),
      span => expect(span.n).to.equal('node.http.server'),
      span => expect(span.k).to.equal(constants.ENTRY),
      span => expect(span.data.http.url).to.equal(path)
    ]);
  }
});
