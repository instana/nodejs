/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const { expect } = require('chai');
const path = require('path');
const constants = require('@_local/core').tracing.constants;
const Control = require('../Control');
const { expectExactlyOneMatching } = require('@_local/core/test/test_util');
const config = require('@_local/core/test/config');
const retry = require('@_local/core/test/test_util/retry');
const { delay } = require('bluebird');
const supportedVersion = require('@_local/core').tracing.supportedVersion;
const entityId = '/subscriptions/instana/resourceGroups/East US/providers/Microsoft.Web/sites/test-app';
const containerAppPath = path.join(__dirname, './app.mjs');
const instanaAgentKey = 'azure-container-service-dummy-key';

// NOTE: This test does not run directly against Azure App Service; instead, it is locally mocked.

// Run the tests only for supported node versions
if (supportedVersion(process.versions.node)) {
  describe('Azure Container Service esm test', function () {
    this.timeout(config.getTestTimeout());
    this.slow(config.getTestTimeout() / 2);

    describe('when the back end is up', function () {
      let control;

      before(async () => {
        control = new Control({
          containerAppPath,
          instanaAgentKey,
          startBackend: true,
          env: {
            ESM_TEST: true,
            WEBSITE_OWNER_NAME: 'instana+123',
            WEBSITE_RESOURCE_GROUP: 'East US',
            WEBSITE_SITE_NAME: 'test-app'
          }
        });

        await control.start();
      });

      beforeEach(async () => {
        await control.reset();
        await control.resetBackendSpans();
      });

      after(async () => {
        await control.stop();
      });

      it('should trace http requests', () => {
        return control
          .sendRequest({
            method: 'GET',
            path: '/'
          })
          .then(response => {
            return verify(control, response, true);
          });
      });
    });

    describe('when the back end is down', function () {
      let control;

      before(async () => {
        control = new Control({
          containerAppPath,
          instanaAgentKey,
          startBackend: false,
          // The initialization fails.
          azureContainerUninitialized: true
        });

        await control.start();
      });

      beforeEach(async () => {
        await control.reset();
        await control.resetBackendSpans();
      });

      after(async () => {
        await control.stop();
      });

      it('should ignore connection failures gracefully', () => {
        return control
          .sendRequest({
            method: 'GET',
            path: '/'
          })
          .then(response => {
            return verify(control, response, false);
          });
      });
    });

    describe('when required environment variables are not present', function () {
      let control;

      before(async () => {
        control = new Control({
          containerAppPath,
          instanaAgentKey,
          startBackend: false,
          azureContainerUninitialized: true
        });

        await control.start();
      });

      beforeEach(async () => {
        await control.reset();
        await control.resetBackendSpans();
      });

      after(async () => {
        await control.stop();
      });

      it('should not trace', () => {
        return control
          .sendRequest({
            method: 'GET',
            path: '/'
          })
          .then(() => delay(1000))
          .then(() => {
            return verifyNoSpans(control);
          });
      });
    });

    function verify(control, response, expectSpans) {
      expect(response.message).to.equal('Hello Azure Container Service!');
      if (expectSpans) {
        return retry(async () => {
          const { entry, exit } = await getAndVerifySpans(control);
          return { entry, exit };
        });
      } else {
        return verifyNoSpans(control);
      }
    }

    function getAndVerifySpans(control) {
      return control.getSpans().then(spans => verifySpans(spans, control));
    }

    function verifySpans(spans, control) {
      const entry = verifyHttpEntry(spans, control);
      const exit = verifyHttpExit(spans, entry, control);
      return { entry, exit };
    }

    function verifyHttpEntry(spans, control) {
      return expectExactlyOneMatching(spans, span => {
        expect(span.t).to.exist;
        expect(span.p).to.not.exist;
        expect(span.s).to.exist;
        expect(span.n).to.equal('node.http.server');
        expect(span.k).to.equal(constants.ENTRY);
        expect(span.f).to.be.an('object');
        expect(span.f.h).to.not.exist;
        expect(span.f.hl).to.be.true;
        expect(span.f.cp).to.equal('azure');
        expect(span.f.e).to.equal(entityId);
        expect(span.data.http.method).to.equal('GET');
        expect(span.data.http.url).to.equal('/');
        expect(span.data.http.host).to.contain(`127.0.0.1:${control.getPort()}`);
        expect(span.data.http.status).to.equal(200);
        expect(span.ec).to.equal(0);
        verifyHeaders(span);
      });
    }

    function verifyHttpExit(spans, entry, control) {
      return expectExactlyOneMatching(spans, span => {
        expect(span.t).to.equal(entry.t);
        expect(span.p).to.equal(entry.s);
        expect(span.s).to.exist;
        expect(span.n).to.equal('node.http.client');
        expect(span.k).to.equal(constants.EXIT);
        expect(span.f).to.be.an('object');
        expect(span.f.h).to.not.exist;
        expect(span.f.hl).to.be.true;
        expect(span.f.cp).to.equal('azure');
        expect(span.f.e).to.equal(entityId);
        expect(span.data.http).to.be.an('object');
        expect(span.data.http.method).to.equal('GET');
        expect(span.data.http.url).to.contain(control.downstreamDummyUrl);
        expect(span.ec).to.equal(0);
        verifyHeaders(span);
      });
    }

    function verifyHeaders(payload) {
      const headers = payload._receivedHeaders;
      expect(headers).to.exist;
      expect(headers['x-instana-host']).to.equal(entityId);
      expect(headers['x-instana-key']).to.equal(instanaAgentKey);
      expect(headers['x-instana-time']).to.not.exist;
    }

    function verifyNoSpans(control) {
      return control.getSpans().then(spans => {
        expect(spans).to.be.empty;
      });
    }
  });
} else {
  // Skip the tests for unsupported Node.js version
  describe('[ESM] Azure Container Service', function () {
    it('should skip tests for unsupported Node.js version', function () {
      // eslint-disable-next-line no-console
      console.log(`Skipping tests. Node.js version ${process.versions.node} is not supported.`);
    });
  });
}
