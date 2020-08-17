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
const zone = `${region}-1`;
const instanceId =
  // eslint-disable-next-line max-len
  '00bf4bf02da23aa66c43a397044cc49beeeade73374388d5cae046c298189b6398dab7d53d8f906fa9456f94da85c2c9fbf6d701234567890123456789';
const projectId = 'test-gcp-project';
const numericProjectId = '13027872031';
const service = 'nodejs-google-cloud-run-test';
const revision = `${service}-00042-heq`;

const containerAppPath = path.join(__dirname, './app');
const instanaAgentKey = 'google-cloud-run-dummy-key';
const testStartedAt = Date.now();

function prelude(opts = {}) {
  this.timeout(config.getTestTimeout());
  this.slow(config.getTestTimeout() / 2);

  const controlOpts = {
    ...opts,
    containerAppPath,
    downstreamDummyPort,
    downstreamDummyUrl,
    instanaAgentKey
  };
  return new Control(controlOpts).registerTestHooks();
}

describe('Google Cloud Run integration test', function() {
  describe('when the back end is up', function() {
    const control = prelude.bind(this)({
      startBackend: true
    });

    it('should collect metrics and trace http requests', () =>
      control
        .sendRequest({
          method: 'GET',
          path: '/'
        })
        .then(response => verify(control, response, true)));
  });

  describe('when the back end is down', function() {
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

  describe('when the back end becomes available after being down initially', function() {
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

  function verify(control, response, expectMetricsAndSpans) {
    expect(response).to.equal('Hello Google Cloud Run!');
    if (expectMetricsAndSpans) {
      return retry(() => getAndVerifySnapshotDataAndMetrics(control).then(() => getAndVerifySpans(control)));
    } else {
      return verifyNoSpansAndMetrics(control);
    }
  }

  function getAndVerifySnapshotDataAndMetrics(control) {
    return Promise.all([control.getAggregatedMetrics(), control.getMetrics()]).then(verifySnapshotDataAndMetrics);
  }

  function verifySnapshotDataAndMetrics([allEntities, allSnapshotUpdates]) {
    expect(allEntities).to.be.an('array');
    const expectedNumberOfPlugins = 4;
    if (allEntities.length < expectedNumberOfPlugins) {
      fail(
        'Error: Received less entities than expected: ' +
          `Wanted: ${expectedNumberOfPlugins}, got: ${allEntities.length}. ` +
          'Here are the entities that have been received: ' +
          JSON.stringify(allEntities.map(({ name, entityId }) => ({ name, entityId })), null, 2)
      );
    }
    expect(allEntities).to.have.lengthOf.at.least(expectedNumberOfPlugins);

    verifyGoogleCloudRunServiceRevision(allEntities);
    verifyGoogleCloudRunDockerPayload(allEntities);

    const processData = verifyProcessPayload(allEntities);
    verifyNodeJsPayload(allEntities, processData);

    verifyHeadersForSnapshotUpdates(allSnapshotUpdates);
  }

  function verifyGoogleCloudRunServiceRevision(allEntities) {
    const googleCloudRunServiceRevisionPayload = allEntities.find(
      pluginPayload => pluginPayload.name === 'com.instana.plugin.gcp.run.revision'
    );
    expect(googleCloudRunServiceRevisionPayload).to.exist;
    expect(googleCloudRunServiceRevisionPayload.entityId).to.equal(revision);
    expect(Object.keys(googleCloudRunServiceRevisionPayload)).to.have.lengthOf(3);
    const containerData = googleCloudRunServiceRevisionPayload.data;
    expect(containerData).to.exist;
    expect(containerData.region).to.equal(region);
    expect(containerData.availabilityZone).to.equal(zone);
    expect(containerData.instanceId).to.equal(instanceId);
    expect(containerData.projectId).to.equal(projectId);
    expect(containerData.numericProjectId).to.equal(numericProjectId);
  }

  function verifyGoogleCloudRunDockerPayload(allEntities) {
    const googleCloudRunDockerPayload = allEntities.find(
      pluginPayload => pluginPayload.name === 'com.instana.plugin.docker'
    );
    expect(googleCloudRunDockerPayload).to.exist;
    expect(googleCloudRunDockerPayload.entityId).to.equal(instanceId);
    expect(Object.keys(googleCloudRunDockerPayload)).to.have.lengthOf(3);
    const dockerData = googleCloudRunDockerPayload.data;
    expect(dockerData).to.exist;
    expect(dockerData.Id).to.equal(instanceId);
  }

  function verifyProcessPayload(allEntities) {
    const processPayload = allEntities.find(pluginPayload => pluginPayload.name === 'com.instana.plugin.process');
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
    expect(processData.containerType).to.equal('docker');
    expect(processData['com.instana.plugin.host.pid']).to.equal(processData.pid);
    expect(processData.container).to.equal(instanceId);
    expect(processData['com.instana.plugin.host.name']).to.equal(revision);
    return processData;
  }

  function verifyNodeJsPayload(allEntities, processData) {
    const isNode = pluginPayload => pluginPayload.name === 'com.instana.plugin.nodejs';
    const nodeJsPayload = allEntities.find(isNode);
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

  function getAndVerifySpans(control) {
    return control.getSpans().then(spans => verifySpans(spans));
  }

  function verifySpans(spans) {
    const entry = verifyHttpEntry(spans);
    verifyHttpExit(spans, entry);
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
    expect(headers['x-instana-host']).to.equal(revision);
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
