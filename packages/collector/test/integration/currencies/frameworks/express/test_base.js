/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const expect = require('chai').expect;

const constants = require('@_local/core').tracing.constants;
const tracingUtil = require('@_local/core/src/tracing/tracingUtil');
const testUtils = require('@_local/core/test/test_util');
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');
const globalAgent = require('@_local/collector/test/globalAgent');

module.exports = function (name, version, isLatest) {
  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  let controls;

  before(async () => {
    controls = new ProcessControls({
      dirname: __dirname,
      useGlobalAgent: true,
      env: {
        LIBRARY_LATEST: isLatest,
        LIBRARY_VERSION: version,
        LIBRARY_NAME: name
      }
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

  describe('express.js path templates', () => {
    check('/blub', '/blub', true);
    check('/sub/bar/42', '/sub/bar/:id', true);
    check('/sub/sub/bar/42', '/sub/sub/bar/:id', true);
    check('/sub/sub/bar/42', '/sub/sub/bar/:id', false);

    function check(actualPath, expectedTemplate, isRootSpan) {
      it(`must report express path templates for actual path: ${actualPath}`, () => {
        const request = {
          method: 'GET',
          path: actualPath
        };
        if (!isRootSpan) {
          request.headers = {
            'X-INSTANA-T': tracingUtil.generateRandomTraceId(),
            'X-INSTANA-S': tracingUtil.generateRandomSpanId()
          };
        }
        return controls.sendRequest(request).then(() =>
          testUtils.retry(() =>
            agentControls.getSpans().then(spans => {
              testUtils.expectAtLeastOneMatching(spans, [
                span => expect(span.n).to.equal('node.http.server'),
                span => expect(span.k).to.equal(constants.ENTRY),
                span => expect(span.data.http.path_tpl).to.equal(expectedTemplate)
              ]);
            })
          )
        );
      });
    }
  });

  describe('custom path templates via annotate', () => {
    it('must report custom path template', () => {
      const request = {
        method: 'GET',
        path: '/with-annotate'
      };
      return controls.sendRequest(request).then(() =>
        testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.k).to.equal(constants.ENTRY),
              span => expect(span.data.http.path_tpl).to.equal('/user/{id}/details')
            ]);
          })
        )
      );
    });

    it('must report custom path template with additional middleware', () => {
      const request = {
        method: 'GET',
        path: '/annotate-with-middleware',
        qs: {
          authenticated: true
        },
        resolveWithFullResponse: true
      };
      return controls.sendRequest(request).then(() => {
        return testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.k).to.equal(constants.ENTRY),
              span => expect(span.data.http.path_tpl).to.equal('/user/{id}/details')
            ]);
          })
        );
      });
    });

    it('must report custom path template when middleware rejects the request early', () => {
      const request = {
        method: 'GET',
        path: '/annotate-with-middleware',
        qs: {
          authenticated: false
        },
        simple: false,
        resolveWithFullResponse: true
      };
      return controls.sendRequest(request).then(() => {
        return testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.k).to.equal(constants.ENTRY),
              span => expect(span.data.http.path_tpl).to.equal('/user/{id}/details')
            ]);
          })
        );
      });
    });
  });

  describe('express uncaught errors', () => {
    let uncaughtControls;

    before(async () => {
      uncaughtControls = new ProcessControls({
        dirname: __dirname,
        appName: 'app_uncaught_errors',
        useGlobalAgent: true,
        env: {
          LIBRARY_LATEST: isLatest,
          LIBRARY_VERSION: version,
          LIBRARY_NAME: name
        }
      });

      await uncaughtControls.startAndWaitForAgentConnection();
    });

    beforeEach(async () => {
      await agentControls.clearReceivedTraceData();
    });

    after(async () => {
      await uncaughtControls.stop();
    });

    afterEach(async () => {
      await uncaughtControls.clearIpcMessages();
    });

    [false, true].forEach(isRootSpan => registerUncaughtTests(isRootSpan));

    function registerUncaughtTests(isRootSpan) {
      it(`must record result of default express uncaught error function (root span: ${isRootSpan})`, () =>
        uncaughtControls.sendRequest(createUncaughtRequest(false, isRootSpan)).then(() => {
          return testUtils.retry(() =>
            agentControls.getSpans().then(spans => {
              testUtils.expectAtLeastOneMatching(spans, [
                span => expect(span.n).to.equal('node.http.server'),
                span => expect(span.k).to.equal(constants.ENTRY),
                span => expect(span.f.e).to.equal(String(uncaughtControls.getPid())),
                span => expect(span.f.h).to.equal('agent-stub-uuid'),
                span => expect(span.error).to.not.exist,
                span => expect(span.ec).to.equal(1),
                span => expect(span.data.http.error).to.match(/To be caught by default error handler/)
              ]);
            })
          );
        }));

      it(`must record result of custom express uncaught error function (root span: ${isRootSpan})`, () =>
        uncaughtControls.sendRequest(createUncaughtRequest(true, isRootSpan)).then(() => {
          return testUtils.retry(() =>
            agentControls.getSpans().then(spans => {
              testUtils.expectAtLeastOneMatching(spans, [
                span => expect(span.n).to.equal('node.http.server'),
                span => expect(span.k).to.equal(constants.ENTRY),
                span => expect(span.f.e).to.equal(String(uncaughtControls.getPid())),
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
};

function createUncaughtRequest(customErrorHandler, isRootSpan) {
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
