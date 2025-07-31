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
  mochaSuiteFn(`tracing/express@${version}`, function () {
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
  });
});
