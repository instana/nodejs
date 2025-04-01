/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const expect = require('chai').expect;

const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const testUtils = require('../../../../../core/test/test_util');
const globalAgent = require('../../../globalAgent');
const constants = require('@instana/core').tracing.constants;

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

['latest', 'v4'].forEach(version => {
  mochaSuiteFn(`tracing/express@${version} tracing/stackTraces`, function () {
    this.timeout(config.getTestTimeout());

    globalAgent.setUpCleanUpHooks();
    const agentControls = globalAgent.instance;

    const expressProxyControls = require('../../protocols/http/proxy/expressProxyControls');
    const expressControls = require('../../../apps/expressControls');

    describe('with stack trace lenght of 0', () => {
      before(async () => {
        await expressControls.start({ useGlobalAgent: true });
        await expressProxyControls.start({
          useGlobalAgent: true,
          expressControls,
          stackTraceLength: 0,
          EXPRESS_VERSION: version
        });
      });

      after(async () => {
        await expressControls.stop();
        await expressProxyControls.stop();
      });

      beforeEach(async () => {
        await agentControls.clearReceivedTraceData();
      });

      beforeEach(() => agentControls.waitUntilAppIsCompletelyInitialized(expressControls.getPid()));
      beforeEach(() => agentControls.waitUntilAppIsCompletelyInitialized(expressProxyControls.getPid()));

      it('must not add stack traces to the spans', () =>
        expressProxyControls
          .sendRequest({
            method: 'POST',
            path: '/checkout',
            responseStatus: 201
          })
          .then(() =>
            testUtils.retry(() =>
              agentControls.getSpans().then(spans => {
                expect(spans.length).to.equal(3);
                testUtils.expectAtLeastOneMatching(spans, [
                  span => expect(span.n).to.equal('node.http.server'),
                  span => expect(span.stack).to.have.lengthOf(0)
                ]);

                testUtils.expectAtLeastOneMatching(spans, [
                  span => expect(span.n).to.equal('node.http.client'),
                  span => expect(span.stack).to.have.lengthOf(0)
                ]);
              })
            )
          ));
    });

    describe('with enabled stack traces', () => {
      before(async () => {
        await expressControls.start({ useGlobalAgent: true });
        await expressProxyControls.start({
          useGlobalAgent: true,
          expressControls,
          stackTraceLength: 10,
          EXPRESS_VERSION: version
        });
      });

      after(async () => {
        await expressControls.stop();
        await expressProxyControls.stop();
      });

      beforeEach(async () => {
        await agentControls.waitUntilAppIsCompletelyInitialized(expressControls.getPid());
      });

      beforeEach(async () => {
        await agentControls.waitUntilAppIsCompletelyInitialized(expressProxyControls.getPid());
      });

      it('must not add stack traces to entry spans', () =>
        expressProxyControls
          .sendRequest({
            method: 'POST',
            path: '/checkout',
            responseStatus: 201
          })
          .then(() =>
            testUtils.retry(() =>
              agentControls.getSpans().then(spans => {
                expect(spans.length).to.equal(6);
                testUtils.expectAtLeastOneMatching(spans, [
                  span => expect(span.n).to.equal('node.http.server'),
                  span => expect(span.stack).to.have.lengthOf(0)
                ]);
              })
            )
          ));

      it('must add stack traces to exit spans', () =>
        expressProxyControls
          .sendRequest({
            method: 'POST',
            path: '/checkout',
            responseStatus: 201
          })
          .then(() =>
            testUtils.retry(() =>
              agentControls.getSpans().then(spans => {
                expect(spans.length).to.equal(9);
                testUtils.expectAtLeastOneMatching(spans, [
                  span => expect(span.n).to.equal('node.http.client'),
                  span => expect(span.k).to.equal(constants.EXIT),
                  span => expect(span.stack[2].m).to.equal('fetch'),
                  span => expect(span.stack[2].c).to.contains('node-fetch')
                ]);
              })
            )
          ));
    });
  });
});
