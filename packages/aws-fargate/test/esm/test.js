/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const { expect, assert } = require('chai');
const { fail } = assert;
const path = require('path');
const constants = require('@_local/core').tracing.constants;

const Control = require('../Control');
const { expectExactlyOneMatching } = require('@_local/core/test/test_util');
const config = require('@_local/core/test/config');
const retry = require('@_local/core/test/test_util/retry');

const region = 'us-east-2';
const account = '555123456789';
const instrumentedContainerName = 'nodejs-fargate-test-container';
const taskArn = `arn:aws:ecs:${region}:${account}:task/55566677-c1e5-5780-9806-aabbccddeeff`;
const instrumentedContainerId = `${taskArn}::${instrumentedContainerName}`;
const supportedVersion = require('@_local/core').tracing.supportedVersion;
const containerAppPath = path.join(__dirname, './app.mjs');
const instanaAgentKey = 'aws-fargate-dummy-key';
const requestHeaders = {
  'X-Entry-Request-Header-1': 'entry request header value 1',
  'X-Entry-Request-Header-2': ['entry', 'request', 'header', 'value 2'],
  'X-Entry-Request-Header-3': 'not configured to capture this',
  'X-Entry-Request-Header-4': ['not', 'configured', 'to', 'be', 'captured']
};

function prelude(opts = {}) {
  let env = {
    INSTANA_EXTRA_HTTP_HEADERS:
      'x-entry-request-header-1; X-ENTRY-REQUEST-HEADER-2 ; x-entry-response-header-1;X-ENTRY-RESPONSE-HEADER-2 , ' +
      'x-eXit-Request-Header-1; X-EXIT-REQUEST-HEADER-2 ',
    ESM_TEST: true
  };

  if (opts.env) {
    env = {
      ...env,
      ...opts.env
    };
  }

  if (opts.proxy) {
    env.INSTANA_ENDPOINT_PROXY = opts.proxy;
  }

  return env;
}

// NOTE: This test does not run against AWS Fargate. Instead, it is mocked using a metadata mock API.
//       It mimics the Amazon ECS Task Metadata Endpoint, which provides env details for tasks running on AWS Fargate.
// API Documentation: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-metadata-endpoint-v3-fargate.html
// Local mock path: packages/aws-fargate/test/metadata_mock/index.js

// Run the tests only for supported node versions
if (supportedVersion(process.versions.node)) {
  describe('AWS fargate esm test', function () {
    this.timeout(config.getTestTimeout());
    this.slow(config.getTestTimeout() / 2);

    describe('when the back end is up (platform version 1.3.0)', function () {
      const env = prelude.bind(this)({});

      let control;

      before(async () => {
        control = new Control({
          env,
          platformVersion: '1.3.0',
          containerAppPath,
          instanaAgentKey,
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
            path: '/',
            headers: requestHeaders
          })
          .then(response => {
            return verify(control, response, true);
          });
      });
    });

    function verify(control, response, expectMetricsAndSpans) {
      expect(response.message).to.equal('Hello Fargate!');
      if (expectMetricsAndSpans) {
        return retry(async () => {
          const allEntities = await getAndVerifySnapshotDataAndMetrics(control);
          const { entry, exit } = await getAndVerifySpans(control);
          return { allEntities, entry, exit };
        });
      }
    }

    async function getAndVerifySnapshotDataAndMetrics(control) {
      const [allEntities, allSnapshotUpdates] = await Promise.all([
        control.getAggregatedMetrics(),
        control.getMetrics()
      ]);
      verifySnapshotDataAndMetrics([allEntities, allSnapshotUpdates]);
      return allEntities;
    }

    function verifySnapshotDataAndMetrics([allEntities]) {
      expect(allEntities).to.be.an('array');
      const expectedNumberOfPlugins = 7;
      if (allEntities.length < expectedNumberOfPlugins) {
        fail(
          // eslint-disable-next-line prefer-template
          'Error: Received less entities than expected: ' +
            `Wanted: ${expectedNumberOfPlugins}, got: ${allEntities.length}. ` +
            'Here are the entities that have been received: ' +
            JSON.stringify(
              allEntities.map(({ name, entityId }) => ({ name, entityId })),
              null,
              2
            )
        );
      }
      expect(allEntities).to.have.lengthOf.at.least(expectedNumberOfPlugins);
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
        expect(span.f.cp).to.equal('aws');
        expect(span.f.e).to.equal(instrumentedContainerId);
        expect(span.data.http.method).to.equal('GET');
        expect(span.data.http.url).to.equal('/');
        expect(span.data.http.host).to.equal(`127.0.0.1:${control.getPort()}`);
        expect(span.data.http.status).to.equal(200);
        expect(span.data.http.header).to.deep.equal({
          'x-entry-request-header-1': 'entry request header value 1',
          'x-entry-request-header-2': 'entry,request,header,value 2',
          'x-entry-response-header-1': 'entry response header value 1',
          'x-entry-response-header-2': 'entry, response, header, value 2'
        });
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
        expect(span.f.cp).to.equal('aws');
        expect(span.f.e).to.equal(instrumentedContainerId);
        expect(span.data.http.method).to.equal('GET');
        expect(span.data.http.url).to.contain(control.downstreamDummyUrl);
        expect(span.data.http.header).to.deep.equal({
          'x-exit-request-header-1': 'exit request header value 1',
          'x-exit-request-header-2': 'exit, request, header, value 2'
        });
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
  });
} else {
  describe('AWS fargate esm test', function () {
    it('should skip tests for unsupported Node.js version', function () {
      // eslint-disable-next-line no-console
      console.log(`Skipping tests. Node.js version ${process.versions.node} is not supported.`);
    });
  });
}
