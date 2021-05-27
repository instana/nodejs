/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const { expect, assert } = require('chai');
const { fail } = assert;
const path = require('path');
const constants = require('@instana/core').tracing.constants;

const Control = require('../Control');
const { delay, expectExactlyOneMatching } = require('../../../core/test/test_util');
const config = require('../../../serverless/test/config');
const retry = require('../../../serverless/test/util/retry');

const downstreamDummyPort = 4568;
const downstreamDummyUrl = `http://localhost:${downstreamDummyPort}/`;

const region = 'us-central1';
const instanceId =
  // eslint-disable-next-line max-len
  '00bf4bf02da23aa66c43a397044cc49beeeade73374388d5cae046c298189b6398dab7d53d8f906fa9456f94da85c2c9fbf6d701234567890123456789';
const projectId = 'test-gcp-project';
const numericProjectId = 13027872031;
const service = 'nodejs-google-cloud-run-test';
const revision = `${service}-00042-heq`;
const host = `gcp:cloud-run:revision:${revision}`;

const containerAppPath = path.join(__dirname, './app');
const instanaAgentKey = 'google-cloud-run-dummy-key';
const testStartedAt = Date.now();

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

describe('Google Cloud Run integration test', function () {
  describe('when the back end is up', function () {
    const control = prelude.bind(this)();

    it('should collect metrics and trace http requests', () =>
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

  describe('when the back end becomes available after being down initially', function () {
    const control = prelude.bind(this)({
      startBackend: false
    });

    it('should buffer snapshot data, metrics and spans for a limited time until the back end becomes available', () => {
      // 1. send http request
      let response;
      return control
        .sendRequest({
          method: 'GET',
          path: '/'
        })
        .then(_response => {
          response = _response;
          // 2. wait a bit
          return delay(750);
        })
        .then(() =>
          // 3. now start the back end
          control.startBackendAndWaitForIt()
        )
        .then(() => {
          // 4. cloud run collector should send uncompressed snapshot data and the spans as soon as the
          // back end comes up
          return verify(control, response, true);
        });
    });
  });

  describe('with default secrets configuration', function () {
    const control = prelude.bind(this)({
      env: {
        CLOUD_ACCESS_KEY: 'needs to be removed',
        DB_PASSWORD_ABC: 'needs to be removed',
        verysecretenvvar: 'needs to be removed',
        ANOTHER_ENV_VAR: 'this can stay'
      }
    });

    it('must filter secrets from query params', () =>
      control
        .sendRequest({
          method: 'GET',
          path:
            '/?q1=whatever&' +
            'confidential=can-stay&' +
            'abc-key-xyz=needs-to-be-removed&' +
            'def-password-uvw=needs-to-be-removed&' +
            'ghiSeCrETrst=needs-to-be-removed&' +
            'q2=a-value'
        })
        .then(response =>
          verify(control, response, true).then(({ entry }) => {
            expect(entry.data.http.params).to.equal(
              'q1=whatever&' +
                'confidential=can-stay&' +
                'abc-key-xyz=<redacted>&' +
                'def-password-uvw=<redacted>&' +
                'ghiSeCrETrst=<redacted>&' +
                'q2=a-value'
            );
          })
        ));

    it('must filter secrets from env', () =>
      control
        .sendRequest({
          method: 'GET',
          path: '/'
        })
        .then(response =>
          verify(control, response, true).then(({ allEntities }) => {
            // verify that we did not accidentally change the value of the env var that the application sees
            expect(response.env).to.deep.equal({
              CLOUD_ACCESS_KEY: 'needs to be removed',
              DB_PASSWORD_ABC: 'needs to be removed',
              verysecretenvvar: 'needs to be removed',
              ANOTHER_ENV_VAR: 'this can stay'
            });

            // verify that we removed secrets from the captured env vars
            const processEntity = findEntityByName(allEntities, 'com.instana.plugin.process');
            const env = processEntity.data.env;
            expect(env).to.be.an('object');
            expect(env.CLOUD_ACCESS_KEY).to.equal('<redacted>');
            expect(env.DB_PASSWORD_ABC).to.equal('<redacted>');
            expect(env.verysecretenvvar).to.equal('<redacted>');
            expect(env.ANOTHER_ENV_VAR).to.equal('this can stay');

            // always redact the agent key
            expect(env.INSTANA_AGENT_KEY).to.equal('<redacted>');
          })
        ));
  });

  describe('with custom secrets configuration', function () {
    const control = prelude.bind(this)({
      env: {
        INSTANA_SECRETS: 'equals:confidential',
        CLOUD_ACCESS_KEY: 'this can stay',
        DB_PASSWORD_ABC: 'this can stay',
        verysecretenvvar: 'this can stay',
        ANOTHER_ENV_VAR: 'this can stay',
        CONFIDENTIAL: 'this can stay', // we asked for case sensitive comparison
        confidential: 'needs to be removed'
      }
    });

    it('must filter secrets from query params', () =>
      control
        .sendRequest({
          method: 'GET',
          path:
            '/?q1=whatever&' +
            'confidential=needs-to-be-removed&' +
            'abc-key-xyz=can-stay&' +
            'def-password-uvw=can-stay&' +
            'ghiSeCrETrst=can-stay&' +
            'q2=a-value'
        })
        .then(response =>
          verify(control, response, true).then(({ entry }) => {
            expect(entry.data.http.params).to.equal(
              'q1=whatever&' +
                'confidential=<redacted>&' +
                'abc-key-xyz=can-stay&' +
                'def-password-uvw=can-stay&' +
                'ghiSeCrETrst=can-stay&' +
                'q2=a-value'
            );
          })
        ));

    it('must filter secrets from env', () =>
      control
        .sendRequest({
          method: 'GET',
          path: '/'
        })
        .then(response =>
          verify(control, response, true).then(({ allEntities }) => {
            // verify that we did not accidentally change the value of the env var that the application sees
            expect(response.env).to.deep.equal({
              CLOUD_ACCESS_KEY: 'this can stay',
              DB_PASSWORD_ABC: 'this can stay',
              verysecretenvvar: 'this can stay',
              ANOTHER_ENV_VAR: 'this can stay',
              CONFIDENTIAL: 'this can stay',
              confidential: 'needs to be removed'
            });

            // verify that we have removed the secrets from the captured env vars
            const processEntity = findEntityByName(allEntities, 'com.instana.plugin.process');
            const env = processEntity.data.env;
            expect(env).to.be.an('object');
            expect(env.CLOUD_ACCESS_KEY).to.equal('this can stay');
            expect(env.DB_PASSWORD_ABC).to.equal('this can stay');
            expect(env.verysecretenvvar).to.equal('this can stay');
            expect(env.ANOTHER_ENV_VAR).to.equal('this can stay');
            expect(env.CONFIDENTIAL).to.equal('this can stay');
            expect(env.confidential).to.equal('<redacted>');

            // always redact the agent key
            expect(env.INSTANA_AGENT_KEY).to.equal('<redacted>');
          })
        ));
  });

  function verify(control, response, expectMetricsAndSpans) {
    expect(response.message).to.equal('Hello Google Cloud Run!');
    if (expectMetricsAndSpans) {
      return retry(async () => {
        const allEntities = await getAndVerifySnapshotDataAndMetrics(control);
        const { entry, exit } = await getAndVerifySpans(control);
        return { allEntities, entry, exit };
      });
    } else {
      return verifyNoSpansAndMetrics(control);
    }
  }

  async function getAndVerifySnapshotDataAndMetrics(control) {
    const [allEntities, allSnapshotUpdates] = await Promise.all([control.getAggregatedMetrics(), control.getMetrics()]);
    verifySnapshotDataAndMetrics([allEntities, allSnapshotUpdates]);
    return allEntities;
  }

  function verifySnapshotDataAndMetrics([allEntities, allSnapshotUpdates]) {
    expect(allEntities).to.be.an('array');
    const expectedNumberOfPlugins = 3;
    if (allEntities.length < expectedNumberOfPlugins) {
      fail(
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

    verifyGoogleCloudRunServiceRevisionInstance(allEntities);

    const processData = verifyProcessPayload(allEntities);
    verifyNodeJsPayload(allEntities, processData);

    verifyHeadersForSnapshotUpdates(allSnapshotUpdates);
  }

  function verifyGoogleCloudRunServiceRevisionInstance(allEntities) {
    const googleCloudRunServiceRevisionInstancePayload = allEntities.find(
      pluginPayload => pluginPayload.name === 'com.instana.plugin.gcp.run.revision.instance'
    );
    expect(googleCloudRunServiceRevisionInstancePayload).to.exist;
    expect(googleCloudRunServiceRevisionInstancePayload.entityId).to.equal(instanceId);
    expect(Object.keys(googleCloudRunServiceRevisionInstancePayload)).to.have.lengthOf(3);
    const instanceData = googleCloudRunServiceRevisionInstancePayload.data;
    expect(instanceData).to.exist;
    expect(instanceData.region).to.equal(region);
    expect(instanceData.instanceId).to.equal(instanceId);
    expect(instanceData.projectId).to.equal(projectId);
    expect(instanceData.numericProjectId).to.equal(numericProjectId);
  }

  function verifyProcessPayload(allEntities) {
    const processPayload = findEntityByName(allEntities, 'com.instana.plugin.process');
    expect(Object.keys(processPayload)).to.have.lengthOf(3);
    const processData = processPayload.data;
    expect(processData).to.exist;
    expect(processData.pid).to.be.a('number');
    expect(processData.env).to.be.an('object');
    expect(processData.exec).to.contain('node');
    expect(processData.args).to.be.an('array');
    expect(processData.user).to.be.a('string');
    expect(processData.group).to.be.a('number');
    expect(processData.start).to.be.at.least(testStartedAt);
    expect(processData.containerType).to.equal('gcpCloudRunInstance');
    expect(processData['com.instana.plugin.host.pid']).to.equal(processData.pid);
    expect(processData.container).to.equal(instanceId);
    expect(processData['com.instana.plugin.host.name']).to.equal(host);
    return processData;
  }

  function verifyNodeJsPayload(allEntities, processData) {
    const nodeJsPayload = findEntityByName(allEntities, 'com.instana.plugin.nodejs');
    expect(nodeJsPayload).to.exist;
    expect(Object.keys(nodeJsPayload)).to.have.lengthOf(3);
    const nodeJsData = nodeJsPayload.data;
    expect(nodeJsData.pid).to.equal(processData.pid);
    expect(nodeJsData.sensorVersion).to.match(/1\.\d\d+\.\d+/);
    expect(nodeJsData.startTime).to.be.at.most(Date.now());
    expect(nodeJsData.versions).to.be.an('object');
    expect(nodeJsData.versions.node).to.match(/\d+\.\d+\.\d+/);
    expect(`v${nodeJsData.versions.node}`).to.equal(process.version);
    expect(nodeJsData.versions.v8).to.match(/\d+\.\d+\.\d+/);
    expect(nodeJsData.versions.uv).to.match(/\d+\.\d+\.\d+/);
    expect(nodeJsData.versions.zlib).to.match(/\d+\.\d+\.\d+/);

    expect(nodeJsData.name).to.equal('@instana/google-cloud-run');
    expect(nodeJsData.description).to.equal(
      'Instana tracing and monitoring for Node.js based Google Cloud Run services'
    );

    expect(nodeJsData.activeHandles).to.exist;
    expect(nodeJsData.gc.minorGcs).to.exist;
    expect(nodeJsData.gc.majorGcs).to.exist;
    expect(nodeJsData.healthchecks).to.exist;
  }

  function findEntityByName(allEntities, name) {
    return allEntities.find(pluginPayload => pluginPayload.name === name);
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
      expect(span.f.cp).to.equal('gcp');
      expect(span.f.e).to.equal(instanceId);
      expect(span.data.http.method).to.equal('GET');
      expect(span.data.http.url).to.equal('/');
      expect(span.data.http.host).to.equal('127.0.0.1:4216');
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
      expect(span.f.cp).to.equal('gcp');
      expect(span.f.e).to.equal(instanceId);
      expect(span.data.http).to.be.an('object');
      expect(span.data.http.method).to.equal('GET');
      expect(span.data.http.url).to.equal(downstreamDummyUrl);
      expect(span.ec).to.equal(0);
      verifyHeaders(span);
    });
  }

  function verifyHeadersForSnapshotUpdates(allSnapshotUpdates) {
    allSnapshotUpdates.forEach(update => {
      expect(update.plugins).to.be.an('array');
      verifyHeaders(update);
    });
  }

  function verifyHeaders(payload) {
    const headers = payload._receivedHeaders;
    expect(headers).to.exist;
    expect(headers['x-instana-host']).to.equal(host);
    expect(headers['x-instana-key']).to.equal(instanaAgentKey);
    expect(headers['x-instana-time']).to.be.a('string');
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
