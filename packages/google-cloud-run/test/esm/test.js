/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const { expect, assert } = require('chai');
const { fail } = assert;
const path = require('path');
const constants = require('@instana/core').tracing.constants;

const Control = require('../Control');
const { expectExactlyOneMatching } = require('../../../core/test/test_util');
const config = require('@instana/core/test/config');
const retry = require('@instana/core/test/test_util/retry');
const supportedVersion = require('@instana/core').tracing.supportedVersion;

const region = 'us-central1';
const instanceId =
  // eslint-disable-next-line max-len
  '00bf4bf02da23aa66c43a397044cc49beeeade73374388d5cae046c298189b6398dab7d53d8f906fa9456f94da85c2c9fbf6d701234567890123456789';
const projectId = 'test-gcp-project';
const numericProjectId = 13027872031;
const service = 'nodejs-google-cloud-run-test';
const revision = `${service}-00042-heq`;
const host = `gcp:cloud-run:revision:${revision}`;

const containerAppPath = path.join(__dirname, './app.mjs');
const instanaAgentKey = 'google-cloud-run-dummy-key';
const testStartedAt = Date.now();

function prelude(opts = {}) {
  let env = {
    ESM_TEST: true
  };

  if (opts.env) {
    env = {
      ...env,
      ...opts.env
    };
  }

  return env;
}
// Run the tests only for supported node versions
// NOTE: This test does not run directly against GCP Cloud Run; instead, it is locally mocked using metadata-mock
if (supportedVersion(process.versions.node)) {
  describe('Google Cloud Run esm test', function () {
    this.timeout(config.getTestTimeout());
    this.slow(config.getTestTimeout() / 2);

    describe('when the back end is up', function () {
      const env = prelude.bind(this)();

      let appControls;

      before(async () => {
        appControls = new Control({
          containerAppPath,
          instanaAgentKey,
          startBackend: true,
          env
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
            return verify(appControls, response, true);
          });
      });
    });

    describe('when the back end is down', function () {
      const env = prelude.bind(this)({});

      let appControls;

      before(async () => {
        appControls = new Control({
          containerAppPath,
          instanaAgentKey,
          startBackend: false,
          env
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

      it('should ignore connection failures gracefully', () => {
        return appControls
          .sendRequest({
            method: 'GET',
            path: '/'
          })
          .then(response => {
            return verify(appControls, response, false);
          });
      });
    });

    function verify(control, response, expectMetricsAndSpans) {
      expect(response.message).to.equal('Hello Google Cloud Run!');
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

    function verifySnapshotDataAndMetrics([allEntities, allSnapshotUpdates]) {
      expect(allEntities).to.be.an('array');
      const expectedNumberOfPlugins = 3;
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
      expect(nodeJsData.sensorVersion).to.match(/^\d+\.\d+.\d+(?:-rc\.\d+)?$/);
      expect(nodeJsData.startTime).to.be.at.most(Date.now());
      expect(nodeJsData.versions).to.be.an('object');
      expect(nodeJsData.versions.node).to.match(/^\d+\.\d+\.\d+/);
      expect(`v${nodeJsData.versions.node}`).to.equal(process.version);
      expect(nodeJsData.versions.v8).to.match(/^\d+\.\d+\.\d+/);
      expect(nodeJsData.versions.uv).to.match(/^\d+\.\d+\.\d+/);
      expect(nodeJsData.versions.zlib).to.match(/^\d+\.\d+\.\d+/);

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
        expect(span.f.cp).to.equal('gcp');
        expect(span.f.e).to.equal(instanceId);
        expect(span.data.http.method).to.equal('GET');
        expect(span.data.http.url).to.equal('/');
        expect(span.data.http.host).to.equal(`127.0.0.1:${control.getPort()}`);
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
        expect(span.f.cp).to.equal('gcp');
        expect(span.f.e).to.equal(instanceId);
        expect(span.data.http).to.be.an('object');
        expect(span.data.http.method).to.equal('GET');
        expect(span.data.http.url).to.contain(control.downstreamDummyUrl);
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
      expect(headers['x-instana-time']).to.not.exist;
    }
  });
} else {
  // Skip the tests for unsupported Node.js version
  describe('[ESM] Google Cloud Run', function () {
    it('should skip tests for unsupported Node.js version', function () {
      // eslint-disable-next-line no-console
      console.log(`Skipping tests. Node.js version ${process.versions.node} is not supported.`);
    });
  });
}
