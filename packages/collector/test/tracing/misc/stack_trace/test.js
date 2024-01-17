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

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('tracing/stackTraces', function () {
  this.timeout(config.getTestTimeout());

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  const expressProxyControls = require('../../protocols/http/proxy/expressProxyControls');
  const expressControls = require('../../../apps/expressControls');

  describe('with stack trace lenght of 0', () => {
    expressControls.registerTestHooks();
    expressProxyControls.registerTestHooks({
      stackTraceLength: 0
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
    expressControls.registerTestHooks();
    expressProxyControls.registerTestHooks({
      stackTraceLength: 10
    });

    beforeEach(() => agentControls.waitUntilAppIsCompletelyInitialized(expressControls.getPid()));
    beforeEach(() => agentControls.waitUntilAppIsCompletelyInitialized(expressProxyControls.getPid()));

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
              testUtils.expectAtLeastOneMatching(spans, [
                span => expect(span.n).to.equal('node.http.client'),
                span => expect(span.stack[0].m).to.equal('Request.Request.start [as start]'),
                span => expect(span.stack[0].c).to.match(/request\.js$/i)
              ]);
            })
          )
        ));
  });
});
