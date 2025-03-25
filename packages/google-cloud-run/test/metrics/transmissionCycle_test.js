/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const path = require('path');
const { fork } = require('child_process');
const { expect } = require('chai');
const proxyquire = require('proxyquire');
const portfinder = require('@instana/collector/test/test_util/portfinder');
const { retry, createFakeLogger } = require('../../../core/test/test_util');
const testConfig = require('@instana/core/test/config');
const core = require('@instana/core');
let transmissionCycle;

// NOTE: This test does not run directly against GCP Cloud Run; instead, it is locally mocked using metadata-mock
//       It mimics the GCP Metadata Service, which normally provides env details for services running on Google Cloud.
//       Allows integration tests to run without connecting to the actual GCP metadata server.
describe('transmission cycle', function () {
  this.timeout(testConfig.getTestTimeout());
  this.slow(testConfig.getTestTimeout() / 2);

  let metadataMockPort;
  let metadataMockUrl;
  let messagesFromMetadataMock = [];
  let metadataMock;

  let metricsSent;
  let onReadyPayload;
  let onReadyError;

  before(() => {
    const config = core.util.normalizeConfig({});
    core.secrets.init(config);

    metadataMockPort = portfinder();
    metadataMockUrl = `http://localhost:${metadataMockPort}/computeMetadata/v1/`;

    messagesFromMetadataMock = [];
    metadataMock = fork(path.join(__dirname, '../metadata_mock'), {
      stdio: testConfig.getAppStdio(),
      env: Object.assign({
        METADATA_MOCK_PORT: metadataMockPort
      })
    });
    metadataMock.on('message', message => {
      messagesFromMetadataMock.push(message);
    });
    return retry(() => {
      if (messagesFromMetadataMock.indexOf('metadata mock: started') < 0) {
        return Promise.reject(new Error('The metadata mock is still not up.'));
      }
    });
  });

  beforeEach(() => {
    metricsSent = [];
    onReadyPayload = null;
    onReadyError = null;
    transmissionCycle = proxyquire('../../src/metrics/transmissionCycle', {
      '@instana/serverless': {
        backendConnector: { sendMetrics }
      }
    });
  });

  afterEach(() => {
    transmissionCycle.deactivate();
  });

  after(() => {
    messagesFromMetadataMock = [];
    return new Promise(resolve => {
      if (metadataMock) {
        metadataMock.once('exit', resolve);
        metadataMock.kill();
      } else {
        resolve();
      }
    });
  });

  it('should call onReady with initial payload', () => {
    init();

    return retry(() => {
      expect(onReadyError).to.not.exist;
      expect(onReadyPayload).to.exist;
      expect(onReadyPayload.name).to.equal('com.instana.plugin.gcp.run.revision.instance');
    });
  });

  it('should send out metrics', () => {
    init();

    return retry(() => {
      expect(metricsSent).to.have.lengthOf.at.least(1);
      const plugins = metricsSent[0].plugins;
      expect(plugins).to.have.lengthOf.at.least(5);
    });
  });

  function init() {
    transmissionCycle.init(
      {
        logger: createFakeLogger(),
        metrics: { transmissionDelay: 1000 }
      },
      metadataMockUrl,
      onReady
    );
  }

  function onReady(err, payload) {
    if (err) {
      onReadyError = err;
    } else {
      onReadyPayload = payload;
      transmissionCycle.activate();
    }
  }

  function sendMetrics(metrics, callback) {
    metricsSent.push(metrics);
    process.nextTick(callback);
  }
});
