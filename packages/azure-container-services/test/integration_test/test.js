/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const { expect } = require('chai');
const path = require('path');
const constants = require('@instana/core').tracing.constants;
const Control = require('../Control');
const { expectExactlyOneMatching } = require('../../../core/test/test_util');
const config = require('../../../serverless/test/config');
const retry = require('../../../serverless/test/util/retry');

const downstreamDummyPort = 4569;
const downstreamDummyUrl = `http://localhost:${downstreamDummyPort}/`;
const entityId = 'com.instana.plugin.azure.appservice';
const containerAppPath = path.join(__dirname, './app');
const instanaAgentKey = 'azure-container-service-dummy-key';

function prelude(opts = {}) {
  this.timeout(config.getTestTimeout());
  this.slow(config.getTestTimeout() / 2);

  if (opts.startBackend == null) {
    opts.startBackend = true;
  }

  const controlOpts = {
    ...opts,
    containerAppPath,
    downstreamDummyPort,
    downstreamDummyUrl,
    instanaAgentKey
  };
  return new Control(controlOpts).registerTestHooks();
}

describe('Azure Container Service integration test', function () {
  describe('when the back end is up', function () {
    const control = prelude.bind(this)();

    it('should trace http requests', () =>
      control
        .sendRequest({
          method: 'GET',
          path: '/'
        })
        .then(response => verify(control, response, true)));
  });

  describe('when the back end is down', function () {
    const control = prelude.bind(this)({
      startBackend: false
    });

    it('should ignore connection failures gracefully', () =>
      control
        .sendRequest({
          method: 'GET',
          path: '/'
        })
        .then(response => verify(control, response, false)));
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
    return control.getSpans().then(spans => verifySpans(spans));
  }

  function verifySpans(spans) {
        const entry = verifyHttpEntry(spans);
    const exit = verifyHttpExit(spans, entry);
    return { entry, exit };
  }

  function verifyHttpEntry(spans) {
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
      expect(span.data.http.host).to.equal('127.0.0.1:4217');
      expect(span.data.http.status).to.equal(200);
      expect(span.ec).to.equal(0);
      verifyHeaders(span);
    });
  }

  function verifyHttpExit(spans, entry) {
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
      expect(span.data.http.url).to.equal(downstreamDummyUrl);
      expect(span.ec).to.equal(0);
      verifyHeaders(span);
    });
  }

  function verifyHeaders(payload) {
    const headers = payload._receivedHeaders;
    expect(headers).to.exist;
    expect(headers['x-instana-host']).to.equal('com.instana.plugin.azure.appservice');
    expect(headers['x-instana-key']).to.equal(instanaAgentKey);
    expect(headers['x-instana-time']).to.not.exist;
  }

  function verifyNoSpans(control) {
    return control.getSpans().then(spans => {
      expect(spans).to.be.empty;
    });
  }
});
