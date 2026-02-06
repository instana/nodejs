/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const path = require('path');
const fs = require('fs');
const expect = require('chai').expect;
const constants = require('@_instana/core').tracing.constants;
const supportedVersion = require('@_instana/core').tracing.supportedVersion;
const tracingUtil = require('@_instana/core/src/tracing/tracingUtil');
const config = require('@_instana/core/test/config');
const testUtils = require('@_instana/core/test/test_util');
const ProcessControls = require('@_instana/collector/test/test_util/ProcessControls');
const globalAgent = require('@_instana/collector/test/globalAgent');

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

const expressVersions = fs.readdirSync(path.join(__dirname, '../express')).filter(f => f.startsWith('_v'));
const cwd = path.join(__dirname, '../express', expressVersions[expressVersions.length - 1]);

mochaSuiteFn('tracing/express with uncaught errors', function () {
  this.timeout(config.getTestTimeout());

  const agentControls = globalAgent.instance;
  globalAgent.setUpCleanUpHooks();

  let controls;

  before(async () => {
    controls = new ProcessControls({
      dirname: __dirname,
      cwd,
      useGlobalAgent: true
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
