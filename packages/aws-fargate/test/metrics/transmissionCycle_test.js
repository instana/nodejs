/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const path = require('path');
const { fork } = require('child_process');
const { expect } = require('chai');
const proxyquire = require('proxyquire');
const portfinder = require('@_local/collector/test/test_util/portfinder');
const { retry, createFakeLogger } = require('@_local/core/test/test_util');
const testConfig = require('@_local/core/test/config');
const core = require('@_local/core');

let transmissionCycle;

// NOTE: This test does not run against AWS Fargate. Instead, it is mocked using a metadata mock API.
//       It mimics the Amazon ECS Task Metadata Endpoint, which provides env details for tasks running on AWS Fargate.
// API Documentation: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-metadata-endpoint-v3-fargate.html
// Local mock path: packages/aws-fargate/test/metadata_mock/index.js
describe('transmission cycle', function () {
  this.timeout(testConfig.getTestTimeout());
  this.slow(testConfig.getTestTimeout() / 2);

  let messagesFromMetadataMock = [];
  let metadataMock;
  let metadataMockUrl;
  let metricsSent;
  let onReadyPayload;
  let onReadyError;

  before(() => {
    const config = core.coreConfig.normalize();
    core.secrets.init(config);

    const metadataMockPort = portfinder();
    metadataMockUrl = `http://localhost:${metadataMockPort}`;

    messagesFromMetadataMock = [];
    metadataMock = fork(path.join(__dirname, '../metadata_mock'), {
      stdio: testConfig.getAppStdio(),
      env: Object.assign({ METADATA_MOCK_PORT: metadataMockPort })
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
      '@_local/serverless': {
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
      expect(onReadyPayload.name).to.equal('com.instana.plugin.aws.ecs.container');
      expect(onReadyPayload.entityId).to.equal(
        'arn:aws:ecs:us-east-2:555123456789:task/55566677-c1e5-5780-9806-aabbccddeeff::nodejs-fargate-test-container'
      );
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
