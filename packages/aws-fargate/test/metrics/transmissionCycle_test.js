/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const path = require('path');
const { fork } = require('child_process');
const { expect } = require('chai');
const proxyquire = require('proxyquire');

const { consoleLogger } = require('@instana/serverless');
const portfinder = require('@instana/collector/test/test_util/portfinder');

const { retry } = require('../../../core/test/test_util');
const config = require('@instana/core/test/config');

let transmissionCycle;

describe('transmission cycle', function () {
  this.timeout(config.getTestTimeout());
  this.slow(config.getTestTimeout() / 2);

  let messagesFromMetadataMock = [];
  let metadataMock;
  let metadataMockUrl;
  let metricsSent;
  let onReadyPayload;
  let onReadyError;

  before(() => {
    const metadataMockPort = portfinder();
    metadataMockUrl = `http://localhost:${metadataMockPort}`;

    messagesFromMetadataMock = [];
    metadataMock = fork(path.join(__dirname, '../metadata_mock'), {
      stdio: config.getAppStdio(),
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
      '@instana/serverless': {
        backendConnector: { sendMetrics },
        consoleLogger
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
