/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const expect = require('chai').expect;
const path = require('path');
const constants = require('@instana/core').tracing.constants;

const Control = require('../Control');
const { delay, expectExactlyOneMatching, retry } = require('../../../core/test/test_util');
const config = require('@instana/core/test/config');

const instanceId =
  // eslint-disable-next-line max-len
  '00bf4bf02da23aa66c43a397044cc49beeeade73374388d5cae046c298189b6398dab7d53d8f906fa9456f94da85c2c9fbf6d701234567890123456789';
const service = 'nodejs-google-cloud-run-test';
const revision = `${service}-00042-heq`;
const host = `gcp:cloud-run:revision:${revision}`;

const containerAppPath = path.join(__dirname, './app');
const instanaAgentKey = 'google-cloud-run-dummy-key';

const semver = require('semver');

const mochaSuiteFn = semver.lt(semver.coerce(process.versions.node), '24.0.0') ? describe : describe.skip;

// NOTE: This test does not run against the Google Cloud Run on GCP. Instead, it is mocked using a metadata mock API.
//       It mimics the GCP Metadata Service, which provides env details for services running on Google Cloud Run.
// API documentation:  https://cloud.google.com/appengine/docs/legacy/standard/java/accessing-instance-metadata
// Local mock path:  packages/google-cloud-run/test/metadata_mock/index.js
mochaSuiteFn('Using the API', function () {
  this.timeout(config.getTestTimeout());
  this.slow(config.getTestTimeout() / 2);

  describe('when configured properly', function () {
    let appControls;

    before(async () => {
      appControls = new Control({
        containerAppPath,
        instanaAgentKey,
        startDownstreamDummy: false,
        startBackend: true
      });

      await appControls.start();
    });
    beforeEach(async () => {
      await appControls.reset();
      await appControls.resetBackendSpans();
    });

    after(async () => {
      await appControls.stop();
    });

    it('should collect metrics and trace http requests', () => {
      return appControls
        .sendRequest({
          method: 'GET',
          path: '/'
        })
        .then(response => {
          return verify(appControls, response);
        });
    });
  });

  describe('when not configured properly', function () {
    let appControls;

    before(async () => {
      appControls = new Control({
        containerAppPath,
        instanaAgentKey,
        startDownstreamDummy: false,
        startBackend: true,
        unconfigured: false,
        googleCloudRunUninitialized: true
      });

      await appControls.start();
    });

    beforeEach(async () => {
      await appControls.reset();
      await appControls.resetBackendSpans();
    });

    after(async () => {
      await appControls.stop();
    });

    it('should provide a no-op API', () => {
      return appControls
        .sendRequest({
          method: 'GET',
          path: '/'
        })
        .then(response => {
          return verifyNoOp(appControls, response);
        });
    });
  });

  function verify(control, response) {
    expect(response).to.be.an('object');

    expect(response.message).to.equal('Hello Cloud Run!');

    expect(response.logs.debug).to.satisfy(logs => {
      return logs.some(log => /\[instana_\w+\] Sending data to Instana \(\/serverless\/metrics\)/.test(log));
    });

    expect(response.logs.debug).to.satisfy(logs => {
      return logs.some(log => /\[instana_\w+\] Sent data to Instana \(\/serverless\/metrics\)/.test(log));
    });

    expect(response.logs.warn).to.satisfy(logs => {
      return logs.some(log =>
        // eslint-disable-next-line max-len
        /\[instana_\w+\] INSTANA_DISABLE_CA_CHECK is set/.test(log)
      );
    });

    expect(response.logs.info).to.be.empty;
    expect(response.logs.error).to.be.empty;

    expect(response.currentSpan.span.n).to.equal('node.http.server');
    expect(response.currentSpan.span.f.hl).to.be.true;
    expect(response.currentSpan.span.f.e).to.equal(instanceId);
    expect(response.currentSpan.span.f.cp).to.equal('gcp');
    expect(response.currentSpanConstructor).to.equal('SpanHandle');

    return retry(() => getAndVerifySpans(control));
  }

  function getAndVerifySpans(control) {
    return control.getSpans().then(spans => verifySpans(control, spans));
  }

  function verifySpans(control, spans) {
    const entry = verifyHttpEntry(control, spans);
    verifyCustomExit(control, spans, entry);
  }

  function verifyHttpEntry(control, spans) {
    return expectExactlyOneMatching(spans, span => {
      expect(span.t).to.exist;
      expect(span.p).to.not.exist;
      expect(span.s).to.exist;
      expect(span.n).to.equal('node.http.server');
      expect(span.k).to.equal(constants.ENTRY);
      expect(span.f).to.be.an('object');
      expect(span.f.h).to.not.exist;
      expect(span.f.hl).to.be.true;
      expect(span.f.cp).to.equal('gcp');
      expect(span.f.e).to.equal(instanceId);
      expect(span.data.http.method).to.equal('GET');
      expect(span.data.http.url).to.equal('/');
      expect(span.data.http.host).to.contain(`127.0.0.1:${control.getPort()}`);
      expect(span.data.http.status).to.equal(200);
      expect(span.ec).to.equal(0);
      verifyHeaders(span);
    });
  }

  function verifyCustomExit(control, spans, entry) {
    return expectExactlyOneMatching(spans, span => {
      expect(span.t).to.equal(entry.t);
      expect(span.p).to.equal(entry.s);
      expect(span.s).to.exist;
      expect(span.n).to.equal('sdk');
      expect(span.k).to.equal(constants.EXIT);
      expect(span.f).to.be.an('object');
      expect(span.f.h).to.not.exist;
      expect(span.f.hl).to.be.true;
      expect(span.f.cp).to.equal('gcp');
      expect(span.f.e).to.equal(instanceId);
      expect(span.data.sdk.name).to.equal('custom-span');
      expect(span.data.sdk.type).to.equal('exit');
      expect(span.ec).to.equal(0);
      verifyHeaders(span);
    });
  }

  function verifyHeaders(payload) {
    const headers = payload._receivedHeaders;
    expect(headers).to.exist;
    expect(headers['x-instana-host']).to.equal(host);
    expect(headers['x-instana-key']).to.equal(instanaAgentKey);
    expect(headers['x-instana-time']).to.not.exist;
  }

  function verifyNoOp(control, response) {
    expect(response).to.be.an('object');
    expect(response.message).to.equal('Hello Cloud Run!');
    expect(response.logs).to.deep.equal({
      debug: [],
      info: [],
      warn: [],
      error: []
    });
    expect(response.currentSpan).to.deep.equal({});
    expect(response.currentSpanConstructor).to.equal('NoopSpanHandle');
    return verifyNoSpansAndMetrics(control);
  }

  function verifyNoSpansAndMetrics(control) {
    return delay(1000)
      .then(() => verifyNoSpans(control))
      .then(() => verifyNoMetrics(control));
  }

  function verifyNoSpans(control) {
    return control.getSpans().then(spans => {
      expect(spans).to.be.empty;
    });
  }

  function verifyNoMetrics(control) {
    return control.getMetrics().then(metrics => {
      expect(metrics).to.be.empty;
    });
  }
});
