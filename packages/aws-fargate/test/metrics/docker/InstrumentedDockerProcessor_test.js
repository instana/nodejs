/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const path = require('path');
const { fork } = require('child_process');
const { expect } = require('chai');

const { HttpDataSource } = require('@instana/metrics-util');
const portfinder = require('@instana/collector/test/test_util/portfinder');

const { delay, retry } = require('../../../../core/test/test_util');
const config = require('@instana/core/test/config');

const InstrumentedDockerProcessor = require('../../../src/metrics/docker/InstrumentedDockerProcessor');

describe('Docker processor', function () {
  this.timeout(config.getTestTimeout());
  this.slow(config.getTestTimeout() / 2);

  const metadataMockPort = portfinder();
  const metadataMockUrl = `http://localhost:${metadataMockPort}`;
  const metadataStatsMockUrl = `${metadataMockUrl}/stats`;
  let messagesFromMetadataMock = [];
  let metadataMock;

  let dataProcessor;

  before(() => {
    messagesFromMetadataMock = [];
    metadataMock = fork(path.join(__dirname, '../../metadata_mock'), {
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
    dataProcessor = new InstrumentedDockerProcessor(
      new HttpDataSource(metadataMockUrl),
      new HttpDataSource(metadataStatsMockUrl)
    );
  });

  afterEach(() => {
    dataProcessor.deactivate();
    dataProcessor.resetSources();
  });

  after(
    () =>
      new Promise(resolve => {
        if (metadataMock) {
          metadataMock.once('exit', () => resolve());
          metadataMock.kill();
        } else {
          resolve();
        }
      })
  );

  it('should not get ready if no successful fetch has happened', () =>
    // deliberately not activating the source
    delay(50).then(() => expect(dataProcessor.isReady()).to.be.false));

  it('should get ready if a successful fetch has happened', () => {
    dataProcessor.activate();
    return retry(() => expect(dataProcessor.isReady()).to.be.true);
  });

  it('should fetch snapshot data and metrics from metadata endpoint', () => {
    dataProcessor.activate();
    return retry(() => {
      const processedData = dataProcessor._getProcessedData();
      expect(processedData.Id).to.be.a('string');
      expect(processedData.Started).to.be.a('string');
    });
  });

  it('should get the entity ID', () => {
    dataProcessor.activate();
    return retry(() => {
      expect(dataProcessor.getEntityId()).to.equal(
        'arn:aws:ecs:us-east-2:555123456789:task/55566677-c1e5-5780-9806-aabbccddeeff::nodejs-fargate-test-container'
      );
    });
  });

  it('should provide payload when ready', () => {
    dataProcessor.activate();

    return retry(() => {
      const payload = getPayload();
      expect(payload).to.exist;
      expect(payload.name).to.equal('com.instana.plugin.docker');
      expect(payload.entityId).to.equal(
        'arn:aws:ecs:us-east-2:555123456789:task/55566677-c1e5-5780-9806-aabbccddeeff::nodejs-fargate-test-container'
      );
      expect(payload.data.Id).to.be.a('string');
      expect(payload.data.Started).to.be.a('string');
    });
  });

  it('should emit ready event', () => {
    let emittedPayload;
    dataProcessor.on('ready', payload => {
      emittedPayload = payload;
    });
    dataProcessor.activate();

    return retry(() => {
      expect(emittedPayload).to.exist;
      expect(emittedPayload.name).to.equal('com.instana.plugin.docker');
      expect(emittedPayload.entityId).to.equal(
        'arn:aws:ecs:us-east-2:555123456789:task/55566677-c1e5-5780-9806-aabbccddeeff::nodejs-fargate-test-container'
      );
      expect(emittedPayload.data.Id).to.be.a('string');
      expect(emittedPayload.data.Started).to.be.a('string');
    });
  });

  function getPayload() {
    const uncompressedData = dataProcessor.getUncompressedData(true);
    const compressedData = dataProcessor.compress(uncompressedData);
    const payload = dataProcessor.wrapAsPayload(compressedData);
    dataProcessor.setLastTransmittedPayload(uncompressedData);
    return payload;
  }
});
