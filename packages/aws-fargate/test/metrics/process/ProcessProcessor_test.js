'use strict';

const { expect } = require('chai');

const { delay, retry } = require('../../../../core/test/test_util');
const config = require('../../../../serverless/test/config');

const ProcessProcessor = require('../../../src/metrics/process/ProcessProcessor');

describe('Process processor', function() {
  this.timeout(config.getTestTimeout());

  let dataProcessor;

  beforeEach(() => {
    dataProcessor = new ProcessProcessor();
  });

  afterEach(() => {
    dataProcessor.deactivate();
    dataProcessor.resetSources();
  });

  it("should not get ready if core metrics haven't been activated", () => {
    // deliberately not activating the source
    return delay(50).then(() => expect(dataProcessor.isReady()).to.be.false);
  });

  it('should get ready if core metrics have been activated', () => {
    dataProcessor.activate();
    return retry(() => expect(dataProcessor.isReady()).to.be.true);
  });

  it('should get the entity ID', () => {
    dataProcessor.activate();
    return retry(() => {
      expect(dataProcessor.getEntityId()).to.equal(process.pid);
    });
  });

  it('should collect snapshot data and metrics', () => {
    dataProcessor.activate();
    return retry(() => {
      const processedData = dataProcessor._getProcessedData();
      expect(processedData.pid).to.equal(process.pid);
      expect(processedData.pid).to.be.a('number');
      expect(processedData.env).to.be.an('object');
      expect(processedData.exec).to.contain('node');
      expect(processedData.args).to.be.an('array');
      expect(processedData.user).to.be.a('string');
      expect(processedData.group).to.be.a('number');
      expect(processedData.start).to.a('number');
      expect(processedData.start).to.be.greaterThan(1588971164943);
      // expect(processedData.cpu).to.exist;
      // expect(processedData.cpu.user).to.be.a('number');
      // expect(processedData.cpu.sys).to.be.a('number');
    });
  });

  it('should provide snapshot data when ready', () => {
    dataProcessor.activate();

    return retry(() => {
      const payload = getPayload();
      expect(payload).to.exist;
      expect(payload.name).to.equal('com.instana.plugin.process');
      expect(payload.entityId).to.equal(process.pid);
      expect(payload.data.pid).to.equal(process.pid);
      expect(payload.data.env).to.be.an('object');
      expect(payload.data.exec).to.contain('node');
      expect(payload.data.args).to.be.an('array');
      expect(payload.data.user).to.be.a('string');
      expect(payload.data.group).to.be.a('number');
      expect(payload.data.start).to.a('number');
      expect(payload.data.start).to.be.greaterThan(1588971164943);
    });
  });

  it.skip('should provide CPU metrics', () => {
    dataProcessor.activate();

    return retry(() => {
      const payload = getPayload();
      expect(payload).to.exist;
      expect(payload.data.cpu).to.be.an('object');
      expect(payload.data.cpu.user).to.be.a('number');
      expect(payload.data.cpu.sys).to.be.a('number');
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
      expect(emittedPayload.name).to.equal('com.instana.plugin.process');
      expect(emittedPayload.entityId).to.equal(process.pid);
      expect(emittedPayload.data.pid).to.equal(process.pid);
      expect(emittedPayload.data.env).to.be.an('object');
      expect(emittedPayload.data.exec).to.contain('node');
      expect(emittedPayload.data.args).to.be.an('array');
      expect(emittedPayload.data.user).to.be.a('string');
      expect(emittedPayload.data.group).to.be.a('number');
      expect(emittedPayload.data.start).to.a('number');
      expect(emittedPayload.data.start).to.be.greaterThan(1588971164943);
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
