/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const expect = require('chai').expect;
const path = require('path');
const constants = require('@instana/core').tracing.constants;

const semver = require('semver');

const Control = require('../Control');
const { delay, expectExactlyOneMatching } = require('../../../core/test/test_util');
const config = require('@instana/core/test/config');
const retry = require('@instana/core/test/test_util/retry');

const region = 'us-east-2';
const account = '555123456789';
const instrumentedContainerName = 'nodejs-fargate-test-container';
const taskArn = `arn:aws:ecs:${region}:${account}:task/55566677-c1e5-5780-9806-aabbccddeeff`;
const instrumentedContainerId = `${taskArn}::${instrumentedContainerName}`;

const containerAppPath = path.join(__dirname, './app');
const instanaAgentKey = 'aws-fargate-dummy-key';

function prelude() {}

const isNodeV24 = semver.gte(semver.coerce(process.versions.node), '24.0.0');

// NOTE: This test does not run against AWS Fargate. Instead, it is mocked using a metadata mock API.
//       It mimics the Amazon ECS Task Metadata Endpoint, which provides env details for tasks running on AWS Fargate.
// API Documentation: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-metadata-endpoint-v3-fargate.html
// Local mock path: packages/aws-fargate/test/metadata_mock/index.js
describe('Using the API', function () {
  this.timeout(config.getTestTimeout());

  describe('when configured properly', function () {
    prelude.bind(this)();
    let control;

    before(async () => {
      control = new Control({
        containerAppPath,
        instanaAgentKey,
        startDownstreamDummy: false,
        startBackend: true
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

    it('should collect metrics and trace http requests', () => {
      return control
        .sendRequest({
          method: 'GET',
          path: '/'
        })
        .then(response => {
          return verify(control, response);
        });
    });
  });

  describe('when not configured properly', function () {
    prelude.bind(this)({});
    let control;

    before(async () => {
      control = new Control({
        containerAppPath,
        unconfigured: false,
        instanaAgentKey,
        startDownstreamDummy: false,
        startBackend: true,
        fargateUninitialized: true
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

    it('should provide a no-op API', () => {
      return control
        .sendRequest({
          method: 'GET',
          path: '/'
        })
        .then(response => {
          return verifyNoOp(control, response);
        });
    });
  });

  function verify(control, response) {
    return retry(async () => {
      expect(response).to.be.an('object');
      expect(response.message).to.equal('Hello Fargate!');

      expect(response.logs.debug).to.satisfy(logs => {
        return logs.some(log => /\[\w+\] Sending data to Instana \(\/serverless\/metrics\)/.test(log));
      });

      expect(response.logs.debug).to.satisfy(logs => {
        return logs.some(log => /\[\w+\] Sent data to Instana \(\/serverless\/metrics\)/.test(log));
      });

      expect(response.logs.warn).to.satisfy(logs => {
        return logs.some(log =>
          // eslint-disable-next-line max-len
          /\[\w+\] INSTANA_DISABLE_CA_CHECK is set/.test(log)
        );
      });

      // NOTE: skipping for v24 because currently we are getting prebuild incompatibility warning logs
      if (!isNodeV24) {
        expect(response.logs.info).to.be.empty;
        expect(response.logs.error).to.be.empty;
      }

      expect(response.currentSpan.span.n).to.equal('node.http.server');
      expect(response.currentSpan.span.f.hl).to.be.true;
      expect(response.currentSpan.span.f.e).to.equal(instrumentedContainerId);
      expect(response.currentSpan.span.f.cp).to.equal('aws');
      expect(response.currentSpanConstructor).to.equal('SpanHandle');
      await getAndVerifySpans(control);
    });
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
      expect(span.data.http.host).to.equal(`127.0.0.1:${control.getPort()}`);
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
