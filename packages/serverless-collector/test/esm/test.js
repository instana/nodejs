/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const { expect } = require('chai');
const path = require('path');
const constants = require('@_local/core').tracing.constants;
const Control = require('../Control');
const { expectExactlyOneMatching } = require('@_local/core/test/test_util');
const config = require('@_local/core/test/config');
const retry = require('@_local/core/test/test_util/retry');
const supportedVersion = require('@_local/core').tracing.supportedVersion;
const containerAppPath = path.join(__dirname, './app.mjs');
const instanaAgentKey = 'serverless-collector-dummy-key';

if (!supportedVersion(process.versions.node)) {
  // eslint-disable-next-line no-console
  console.log(`Skipping tests. Node.js version ${process.versions.node} is not supported.`);
  it.skip('[serverless-collector] esm', function () {});
  return;
}

describe('[serverless-collector] esm', function () {
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
          ESM_TEST: true
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
        startBackend: false
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

  function verify(control, response, expectSpans) {
    expect(response.message).to.equal('Hello from Serverless Collector App!');
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
      expect(span.f.e).to.exist;
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
      expect(span.f.e).to.exist;
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
    expect(headers['x-instana-host']).to.exist;
    expect(headers['x-instana-key']).to.equal(instanaAgentKey);
    expect(headers['x-instana-time']).to.not.exist;
  }

  function verifyNoSpans(control) {
    return control.getSpans().then(spans => {
      expect(spans).to.be.empty;
    });
  }
});
