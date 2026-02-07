/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

/* eslint-disable no-use-before-define */

'use strict';

const { expect } = require('chai');

const config = require('@_local/core/test/config');
const { delay, retry } = require('../../core/test/test_util');

const DataSource = require('../src/DataSource');
const DataProcessor = require('../src/DataProcessor');

describe('data processor', function () {
  this.timeout(config.getTestTimeout());

  this.slow(1000);

  it('should get entity ID', () => {
    const dataSource = new DummyDataSource(20);
    const dataProcessor = new SingleSourceProcessor(dataSource, 'dummy-entity-id');

    const entityId = dataProcessor.getEntityId();
    expect(entityId).to.equal('dummy-entity-id');
  });

  it('should process data from one data source', () => {
    const dataSource = new DummyDataSource(20);
    const dataProcessor = new SingleSourceProcessor(dataSource, 'dummy-entity-id');
    dataProcessor.activate();

    return retry(() => {
      const processedData = dataProcessor._getProcessedData();
      expect(processedData.processedCounter).to.be.at.least(10);
      expect(processedData.processedCounter % 4).to.equal(0);
    });
  });

  it('should process data from multiple data sources', () => {
    const dataSource1 = new DummyDataSource(20);
    const dataSource2 = new DummyDataSource(20);
    const dataProcessor = new MultiSourceProcessor(dataSource1, dataSource2, 'dummy-entity-id');
    dataProcessor.activate();

    return retry(() => {
      const processedData = dataProcessor._getProcessedData();
      expect(processedData.processedCounter1).to.be.at.least(10);
      expect(processedData.processedCounter2).to.be.at.least(10);
      expect(processedData.processedCounter1 % 8).to.equal(0);
      expect(processedData.processedCounter2 % 16).to.equal(0);
    });
  });

  it('should not be ready if no source is connected', () => {
    const dataProcessor = new DataProcessor('dummy-entity-id');
    expect(dataProcessor.isReady()).to.be.false;
  });

  it('should not get ready if source has not refreshed at least once', () => {
    const dataSource = new DummyDataSource(20);
    const dataProcessor = new SingleSourceProcessor(dataSource, 'dummy-entity-id');

    // deliberately not activating the processor (nor the sources)

    return delay(50).then(() => expect(dataProcessor.isReady()).to.be.false);
  });

  it('should get ready if source has refreshed at least once', () => {
    const dataSource = new DummyDataSource(20);
    const dataProcessor = new SingleSourceProcessor(dataSource, 'dummy-entity-id');
    dataProcessor.activate();

    return retry(() => expect(dataProcessor.isReady()).to.be.true);
  });

  it('should not get ready if not all sources have refreshed at least once', () => {
    const dataSource1 = new DummyDataSource(20);
    const dataSource2 = new DummyDataSource(20);
    const dataProcessor = new MultiSourceProcessor(dataSource1, dataSource2, 'dummy-entity-id');
    dataSource2.activate();
    // deliberately only activating source 2 but not 1

    return delay(50).then(() => expect(dataProcessor.isReady()).to.be.false);
  });

  it('should get ready if all sources have refreshed at least once', () => {
    const dataSource1 = new DummyDataSource(20);
    const dataSource2 = new DummyDataSource(20);
    const dataProcessor = new MultiSourceProcessor(dataSource1, dataSource2, 'dummy-entity-id');
    dataProcessor.activate();

    return retry(() => expect(dataProcessor.isReady()).to.be.true);
  });

  it('should not provide uncompressed data if not ready', () => {
    const dataSource1 = new DummyDataSource(20);
    const dataSource2 = new DummyDataSource(20);
    const dataProcessor = new MultiSourceProcessor(dataSource1, dataSource2, 'dummy-entity-id');
    dataSource1.activate();

    // deliberately only activating one of two sources

    return delay(50).then(() => {
      expect(dataProcessor.getUncompressedData()).to.not.exist;
    });
  });

  it('should provide uncompressed data when ready', () => {
    const dataSource1 = new DummyDataSource(20);
    const dataSource2 = new DummyDataSource(20);
    const dataProcessor = new MultiSourceProcessor(dataSource1, dataSource2, 'dummy-entity-id');
    dataProcessor.activate();

    return retry(() => {
      const uncompressedData = dataProcessor.getUncompressedData();
      expect(uncompressedData).to.exist;
      expect(uncompressedData.processedCounter1).to.be.at.least(10);
      expect(uncompressedData.processedCounter2).to.be.at.least(10);
      expect(uncompressedData.processedCounter1 % 8).to.equal(0);
      expect(uncompressedData.processedCounter2 % 16).to.equal(0);
    });
  });

  it(
    'should provide an empty object for uncompressed data when clients ask for compression ' +
      "and sources haven't refreshed",
    () => {
      const dataSource1 = new DummyDataSource(200);
      const dataSource2 = new DummyDataSource(200);
      const dataProcessor = new MultiSourceProcessor(dataSource1, dataSource2, 'dummy-entity-id');
      dataProcessor.activate();

      return delay(50)
        .then(() => {
          const data = dataProcessor.getUncompressedData(true);
          expect(data).to.deep.equal({
            processedCounter1: 8,
            processedCounter2: 16,
            willBeCompressed: 13
          });
          dataProcessor.setLastTransmittedPayload(data);
          return delay(100);
        })
        .then(() => {
          const data = dataProcessor.getUncompressedData(true);
          expect(data).to.deep.equal({});
          dataProcessor.setLastTransmittedPayload(data);
          return delay(100);
        })
        .then(() => {
          expect(dataProcessor.getUncompressedData(true)).to.deep.equal({
            processedCounter1: 16,
            processedCounter2: 32,
            willBeCompressed: 13
          });
        });
    }
  );

  it('should compress', () => {
    const dataSource1 = new DummyDataSource(20);
    const dataSource2 = new DummyDataSource(20);
    const dataProcessor = new MultiSourceProcessor(dataSource1, dataSource2, 'dummy-entity-id');
    dataProcessor.sendUncompressedEveryXTransmissions = 3;
    dataProcessor.activate();

    function transmissionCycle() {
      const uncompressedData = dataProcessor.getUncompressedData(true);
      const compressedData = dataProcessor.compress(uncompressedData);
      const payload = dataProcessor.wrapAsPayload(compressedData);
      dataProcessor.setLastTransmittedPayload(uncompressedData);
      return payload;
    }

    return delay(50)
      .then(() => {
        // first payload should be uncompressed
        const payload = transmissionCycle();
        expect(payload.name).to.equal('com.plugin.id');
        expect(payload.entityId).to.equal('dummy-entity-id');
        expect(payload.data.processedCounter1).to.be.a('number');
        expect(payload.data.processedCounter2).to.be.a('number');
        expect(payload.data.willBeCompressed).to.be.a('number');
        return delay(100);
      })
      .then(() => {
        // next payload should be compressed
        const payload = transmissionCycle();
        expect(payload.name).to.equal('com.plugin.id');
        expect(payload.entityId).to.equal('dummy-entity-id');
        expect(payload.data.processedCounter1).to.be.a('number');
        expect(payload.data.processedCounter2).to.be.a('number');
        expect(payload.data.willBeCompressed).to.not.exist; // <- proves that compression has been applied
        return delay(100);
      })
      .then(() => {
        // another compressed cycle
        const payload = transmissionCycle();
        expect(payload.name).to.equal('com.plugin.id');
        expect(payload.entityId).to.equal('dummy-entity-id');
        expect(payload.data.processedCounter1).to.be.a('number');
        expect(payload.data.processedCounter2).to.be.a('number');
        expect(payload.data.willBeCompressed).to.not.exist; // <- proves that compression has been applied
        return delay(100);
      })
      .then(() => {
        // next payload should be uncompressed again since we allowed for 3 transmissions before sending a full update
        // (sendUncompressedEveryXTransmissions = 3)
        const payload = transmissionCycle();
        expect(payload.name).to.equal('com.plugin.id');
        expect(payload.entityId).to.equal('dummy-entity-id');
        expect(payload.data.processedCounter1).to.be.a('number');
        expect(payload.data.processedCounter2).to.be.a('number');
        expect(payload.data.willBeCompressed).to.be.a('number'); // <- proves that no compression has been applied
      });
  });

  it('should emit ready event', () => {
    let emittedPayload;
    const dataSource1 = new DummyDataSource(20);
    const dataSource2 = new DummyDataSource(20);
    const dataProcessor = new MultiSourceProcessor(dataSource1, dataSource2, 'dummy-entity-id');
    dataProcessor.on('ready', payload => {
      emittedPayload = payload;
    });
    dataProcessor.activate();

    return retry(() => {
      expect(emittedPayload).to.exist;
      expect(emittedPayload.name).to.equal('com.plugin.id');
      expect(emittedPayload.entityId).to.equal('dummy-entity-id');
      expect(emittedPayload.data.processedCounter1).to.equal(8);
      expect(emittedPayload.data.processedCounter2).to.equal(16);
    });
  });
});

class DummyDataSource extends DataSource {
  constructor(refreshDelay) {
    super(refreshDelay);
    this.rawData.refreshCounter = 0;
  }

  doRefresh(callback) {
    this.rawData.refreshCounter++;
    callback(null, this.rawData);
  }
}

class SingleSourceProcessor extends DataProcessor {
  constructor(dataSource, entityId) {
    super('com.plugin.id');
    this.addSource('dummy', dataSource);
    this.entityId = entityId;
  }

  getEntityId() {
    return this.entityId;
  }

  processData(rawDataPerSource) {
    if (rawDataPerSource.dummy.refreshCounter == null) {
      return {};
    }

    this.ready = true;
    return { processedCounter: rawDataPerSource.dummy.refreshCounter * 4 };
  }
}

class MultiSourceProcessor extends DataProcessor {
  constructor(dataSource1, dataSource2, entityId) {
    super('com.plugin.id');
    this.addSource('one', dataSource1);
    this.addSource('two', dataSource2);
    this.entityId = entityId;
  }

  getEntityId() {
    return this.entityId;
  }

  processData(rawDataPerSource) {
    if (rawDataPerSource.one.refreshCounter == null || rawDataPerSource.two.refreshCounter == null) {
      return null;
    }

    return {
      processedCounter1: rawDataPerSource.one.refreshCounter * 8,
      processedCounter2: rawDataPerSource.two.refreshCounter * 16,
      willBeCompressed: 13
    };
  }
}
