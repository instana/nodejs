/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const { expect } = require('chai');
const semver = require('semver');
const sinon = require('sinon');
const { delay, retry } = require('../../../core/test/test_util');
const testConfig = require('@_local/core/test/config');
const NodeJsProcessor = require('../../src/nodejs/NodeJsProcessor');

describe('Node.js processor', function () {
  this.timeout(testConfig.getTestTimeout());
  const coreAndSharedMetricsDataSource = sinon.stub();
  coreAndSharedMetricsDataSource.on = sinon.stub();
  coreAndSharedMetricsDataSource.activate = sinon.stub();
  coreAndSharedMetricsDataSource.deactivate = sinon.stub();
  coreAndSharedMetricsDataSource.hasRefreshedAtLeastOnce = sinon.stub();
  coreAndSharedMetricsDataSource.getRawData = sinon.stub();

  let dataProcessor;

  before(() => {
    dataProcessor = new NodeJsProcessor(coreAndSharedMetricsDataSource, 42);
  });

  afterEach(() => {
    dataProcessor.deactivate();
    dataProcessor.resetSources();
  });

  it("should not get ready if core metrics haven't been activated", () => {
    coreAndSharedMetricsDataSource.hasRefreshedAtLeastOnce.returns(false);
    // deliberately not activating the source
    delay(50).then(() => expect(dataProcessor.isReady()).to.be.false);
  });

  it('should get ready if core metrics have been activated', () => {
    coreAndSharedMetricsDataSource.hasRefreshedAtLeastOnce.returns(true);
    dataProcessor.activate();
    return retry(() => expect(dataProcessor.isReady()).to.be.true);
  });

  it('should get the entity ID', () => {
    coreAndSharedMetricsDataSource.hasRefreshedAtLeastOnce.returns(true);
    dataProcessor.activate();
    return retry(() => {
      expect(dataProcessor.getEntityId()).to.equal(42);
    });
  });

  it('should collect snapshot data and metrics from core and shared metrics modules', () => {
    coreAndSharedMetricsDataSource.hasRefreshedAtLeastOnce.returns(true);
    coreAndSharedMetricsDataSource.getRawData.returns({
      sensorVersion: '1.2.3',
      versions: {},
      activeHandles: 42,
      activeRequests: 23,
      args: [],
      dependencies: {}
    });

    dataProcessor.activate();
    return retry(() => {
      const processedData = dataProcessor._getProcessedData();
      expect(processedData.pid).to.equal(42);
      expect(semver.valid(processedData.sensorVersion)).to.exist;
      expect(processedData.versions).to.be.an('object');
      expect(processedData.activeHandles).to.be.a('number');
      expect(processedData.activeRequests).to.be.a('number');
      expect(processedData.args).to.be.an('array');
      expect(processedData.dependencies).to.be.an('object');
    });
  });

  it('should provide payload when ready', () => {
    coreAndSharedMetricsDataSource.hasRefreshedAtLeastOnce.returns(true);
    dataProcessor.activate();

    return retry(() => {
      const payload = getPayload();

      expect(payload).to.exist;
      expect(payload.name).to.equal('com.instana.plugin.nodejs');
      expect(payload.entityId).to.equal(42);
      expect(payload.data.pid).to.equal(42);
      expect(payload.data.versions).to.be.an('object');
      expect(payload.data.activeHandles).to.be.a('number');
      expect(payload.data.activeRequests).to.be.a('number');
      expect(payload.data.args).to.be.an('array');
      expect(payload.data.dependencies).to.be.an('object');
    });
  });

  it('should emit ready event', () => {
    coreAndSharedMetricsDataSource.hasRefreshedAtLeastOnce.returns(true);
    setTimeout(() => {
      coreAndSharedMetricsDataSource.on.getCalls()[0].args[1]({
        sensorVersion: '1.2.3',
        versions: {},
        activeHandles: 42,
        activeRequests: 23,
        args: [],
        dependencies: {}
      });
    }, 500);

    let emittedPayload;
    dataProcessor.on('ready', payload => {
      emittedPayload = payload;
    });
    dataProcessor.activate();

    return retry(() => {
      expect(emittedPayload).to.exist;
      expect(emittedPayload.name).to.equal('com.instana.plugin.nodejs');
      expect(emittedPayload.entityId).to.equal(42);
      expect(emittedPayload.data.pid).to.equal(42);
      expect(emittedPayload.data.versions).to.be.an('object');
      expect(emittedPayload.data.activeHandles).to.be.a('number');
      expect(emittedPayload.data.activeRequests).to.be.a('number');
      expect(emittedPayload.data.args).to.be.an('array');
      expect(emittedPayload.data.dependencies).to.be.an('object');
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
