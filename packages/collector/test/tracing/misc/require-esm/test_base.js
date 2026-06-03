/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const semver = require('semver');
const expect = require('chai').expect;
const { supportedVersion } = require('@instana/core').tracing;
const config = require('@instana/core/test/config');
const { retry, expectExactlyOneMatching } = require('@instana/core/test/test_util');
const ProcessControls = require('@instana/collector/test/test_util/ProcessControls');
const globalAgent = require('@instana/collector/test/globalAgent');

const supportsRequireESM = semver.gte(process.versions.node, '20.19.0');
const mochaSuiteFn = supportedVersion(process.versions.node) && supportsRequireESM ? describe : describe.skip;

module.exports = function () {
  mochaSuiteFn('tracing/require(esm)', function () {
    this.timeout(config.getTestTimeout() * 2);

    globalAgent.setUpCleanUpHooks();
    const agentControls = globalAgent.instance;

    describe('tracing enabled, no suppression', function () {
      let controls;

      before(async () => {
        controls = new ProcessControls({
          dirname: __dirname,
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

      it('must trace HTTP requests made with ESM-only package loaded via require()', async () => {
        const response = await controls.sendRequest({
          method: 'GET',
          path: '/make-request'
        });

        expect(response.success).to.equal(true);
        expect(response.statusCode).to.equal(200);

        await retry(async () => {
          const spans = await agentControls.getSpans();

          expect(spans).to.have.lengthOf(2);

          const httpEntry = expectExactlyOneMatching(spans, [
            span => expect(span.n).to.equal('node.http.server'),
            span => expect(span.k).to.equal(1),
            span => expect(span.data.http.method).to.equal('GET'),
            span => expect(span.data.http.url).to.match(/\/make-request/)
          ]);

          const httpExit = expectExactlyOneMatching(spans, [
            span => expect(span.n).to.equal('node.http.client'),
            span => expect(span.k).to.equal(2),
            span => expect(span.t).to.equal(httpEntry.t),
            span => expect(span.p).to.equal(httpEntry.s),
            span => expect(span.data.http.method).to.equal('GET'),
            span => expect(span.data.http.url).to.include('127.0.0.1')
          ]);

          expect(httpExit.data.http.status).to.equal(200);
          expect(httpExit.ec).to.equal(0);
          expect(httpEntry.ec).to.equal(0);
        });
      });
    });

    describe('tracing suppressed', function () {
      let controls;

      before(async () => {
        controls = new ProcessControls({
          dirname: __dirname,
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

      it('should not trace when suppressed', async () => {
        await controls.sendRequest({
          method: 'GET',
          path: '/make-request',
          suppressTracing: true
        });

        await retry(async () => {
          const spans = await agentControls.getSpans();
          expect(spans).to.have.lengthOf(0);
        });
      });
    });
  });
};
