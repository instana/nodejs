/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const expect = require('chai').expect;
const path = require('path');
const constants = require('@instana/core').tracing.constants;

const Control = require('../Control');
const { delay, expectExactlyOneMatching } = require('../../../core/test/test_util');
const config = require('../../../serverless/test/config');
const retry = require('@instana/core/test/test_util/retry');

const region = 'us-east-2';
const account = '555123456789';
const instrumentedContainerName = 'nodejs-fargate-test-container';
const taskArn = `arn:aws:ecs:${region}:${account}:task/55566677-c1e5-5780-9806-aabbccddeeff`;
const instrumentedContainerId = `${taskArn}::${instrumentedContainerName}`;

const containerAppPath = path.join(__dirname, './app');
const instanaAgentKey = 'aws-fargate-dummy-key';

function prelude(opts = {}) {
  this.timeout(config.getTestTimeout());
  this.slow(config.getTestTimeout() / 2);

  const controlOpts = {
    ...opts,
    containerAppPath,
    instanaAgentKey,
    startDownstreamDummy: false,
    startBackend: true
  };
  return new Control(controlOpts).registerTestHooks();
}

describe('Using the API', function () {
  describe('when configured properly', function () {
    const control = prelude.bind(this)();
    it('should collect metrics and trace http requests', () =>
      control
        .sendRequest({
          method: 'GET',
          path: '/'
        })
        .then(response => verify(control, response)));
  });

  describe('when not configured properly', function () {
    const control = prelude.bind(this)({ unconfigured: false });
    it('should provide a no-op API', () =>
      control
        .sendRequest({
          method: 'GET',
          path: '/'
        })
        .then(response => verifyNoOp(control, response)));
  });

  function verify(control, response) {
    expect(response).to.be.an('object');
    expect(response.message).to.equal('Hello Fargate!');

    // During phase 1 of the Kafka header migration (October 2022 - October 2023) there will be a debug log about
    // ignoring the option 'both' for rdkafka. We do not care about that log message in this test.
    const debug = response.logs.debug.filter(msg => !msg.includes('Ignoring configuration or default value'));
    expect(debug).to.deep.equal(['Sending data to Instana (/metrics).', 'Sent data to Instana (/metrics).']);
    expect(response.logs.info).to.be.empty;
    expect(response.logs.warn).to.deep.equal([
      'INSTANA_DISABLE_CA_CHECK is set, which means that the server certificate will not be verified against the ' +
        'list of known CAs. This makes your service vulnerable to MITM attacks when connecting to Instana. This ' +
        'setting should never be used in production, unless you use our on-premises product and are unable to ' +
        'operate the Instana back end with a certificate with a known root CA.'
    ]);
    expect(response.logs.error).to.be.empty;

    expect(response.currentSpan.span.n).to.equal('node.http.server');
    expect(response.currentSpan.span.f.hl).to.be.true;
    expect(response.currentSpan.span.f.e).to.equal(instrumentedContainerId);
    expect(response.currentSpan.span.f.cp).to.equal('aws');
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
      expect(span.f.cp).to.equal('aws');
      expect(span.f.e).to.equal(instrumentedContainerId);
      expect(span.data.http.method).to.equal('GET');
      expect(span.data.http.url).to.equal('/');
      expect(span.data.http.host).to.equal(`127.0.0.1:${control.port}`);
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
      expect(span.f.cp).to.equal('aws');
      expect(span.f.e).to.equal(instrumentedContainerId);
      expect(span.data.sdk.name).to.equal('custom-span');
      expect(span.data.sdk.type).to.equal('exit');
      expect(span.ec).to.equal(0);
      verifyHeaders(span);
    });
  }

  function verifyHeaders(payload) {
    const headers = payload._receivedHeaders;
    expect(headers).to.exist;
    expect(headers['x-instana-host']).to.equal(taskArn);
    expect(headers['x-instana-key']).to.equal(instanaAgentKey);
    expect(headers['x-instana-time']).to.not.exist;
  }

  function verifyNoOp(control, response) {
    expect(response).to.be.an('object');
    expect(response.message).to.equal('Hello Fargate!');
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
