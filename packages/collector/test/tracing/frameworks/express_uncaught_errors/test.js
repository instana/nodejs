'use strict';

const path = require('path');
const expect = require('chai').expect;

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const tracingUtil = require('../../../../../core/src/tracing/tracingUtil');
const config = require('../../../../../core/test/config');
const testUtils = require('../../../../../core/test/test_util');
const ProcessControls = require('../../ProcessControls');

describe('tracing/express with uncaught errors', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  const agentControls = require('../../../apps/agentStubControls');

  this.timeout(config.getTestTimeout());

  agentControls.registerTestHooks();

  const expressUncaughtErrorsControls = new ProcessControls({
    appPath: path.join(__dirname, 'app'),
    agentControls
  }).registerTestHooks();

  [false, true].forEach(isRootSpan => registerTests(isRootSpan));

  function registerTests(isRootSpan) {
    it(`must record result of default express uncaught error function (root span: ${isRootSpan})`, () =>
      expressUncaughtErrorsControls.sendRequest(createRequest(false, isRootSpan)).then(response => {
        expect(response.statusCode).to.equal(500);

        return testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            testUtils.expectAtLeastOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.k).to.equal(constants.ENTRY);
              expect(span.f.e).to.equal(String(expressUncaughtErrorsControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(1);
              expect(span.data.http.error).to.match(/To be caught by default error handler/);
            });
          })
        );
      }));

    it(`must record result of custom express uncaught error function (root span: ${isRootSpan})`, () =>
      expressUncaughtErrorsControls.sendRequest(createRequest(true, isRootSpan)).then(response => {
        expect(response.statusCode).to.equal(400);

        return testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            testUtils.expectAtLeastOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.k).to.equal(constants.ENTRY);
              expect(span.f.e).to.equal(String(expressUncaughtErrorsControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(0);
              expect(span.data.http.error).to.match(/To be caught by custom error handler/);
            });
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
