/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const expect = require('chai').expect;
const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const tracingUtil = require('../../../../../core/src/tracing/tracingUtil');
const config = require('../../../../../core/test/config');
const testUtils = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

['latest', 'v4'].forEach(version => {
  mochaSuiteFn(`tracing/express@${version} with uncaught errors`, function () {
    this.timeout(config.getTestTimeout());

    const agentControls = globalAgent.instance;
    globalAgent.setUpCleanUpHooks();

    // NOTE: require-mock is not working with esm apps. There is also no need to run the ESM APP for all versions.
    // TODO: Support for mocking `import` in ESM apps is planned under INSTA-788.
    if (process.env.RUN_ESM && version !== 'latest') return;

    let controls;

    before(async () => {
      controls = new ProcessControls({
        dirname: __dirname,
        useGlobalAgent: true,
        env: { EXPRESS_VERSION: version }
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

    [false, true].forEach(isRootSpan => registerTests(isRootSpan));

    function registerTests(isRootSpan) {
      it(`must record result of default express uncaught error function (root span: ${isRootSpan})`, () =>
        controls.sendRequest(createRequest(false, isRootSpan)).then(() => {
          return testUtils.retry(() =>
            agentControls.getSpans().then(spans => {
              testUtils.expectAtLeastOneMatching(spans, [
                span => expect(span.n).to.equal('node.http.server'),
                span => expect(span.k).to.equal(constants.ENTRY),
                span => expect(span.f.e).to.equal(String(controls.getPid())),
                span => expect(span.f.h).to.equal('agent-stub-uuid'),
                span => expect(span.error).to.not.exist,
                span => expect(span.ec).to.equal(1),
                span => expect(span.data.http.error).to.match(/To be caught by default error handler/)
              ]);
            })
          );
        }));

      it(`must record result of custom express uncaught error function (root span: ${isRootSpan})`, () =>
        controls.sendRequest(createRequest(true, isRootSpan)).then(() => {
          return testUtils.retry(() =>
            agentControls.getSpans().then(spans => {
              testUtils.expectAtLeastOneMatching(spans, [
                span => expect(span.n).to.equal('node.http.server'),
                span => expect(span.k).to.equal(constants.ENTRY),
                span => expect(span.f.e).to.equal(String(controls.getPid())),
                span => expect(span.f.h).to.equal('agent-stub-uuid'),
                span => expect(span.error).to.not.exist,
                span => expect(span.ec).to.equal(0),
                span => expect(span.data.http.error).to.match(/To be caught by custom error handler/)
              ]);
            })
          );
        }));
    }
  });
});

function createRequest(customErrorHandler, isRootSpan) {
  const request = {
    method: 'GET',
    path: customErrorHandler ? '/customErrorHandler' : '/defaultErrorHandler',
    simple: false,
    resolveWithFullResponse: true
  };
  if (!isRootSpan) {
    request.headers = {
      'X-INSTANA-T': tracingUtil.generateRandomTraceId(),
      'X-INSTANA-S': tracingUtil.generateRandomSpanId()
    };
  }
  return request;
}
