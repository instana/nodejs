'use strict';

const { expect } = require('chai');

const { delay, retry } = require('../../../../core/test/test_util');
const config = require('../../../../serverless/test/config');

const ProcessSnapshotDataSource = require('../../../src/metrics/process/ProcessSnapshotDataSource');

describe('process snapshot data source', function() {
  this.timeout(config.getTestTimeout());

  let dataSource;
  beforeEach(() => {
    dataSource = new ProcessSnapshotDataSource();
  });

  afterEach(() => {
    dataSource.deactivate();
    dataSource.reset();
  });

  it('should know that no refresh has happened yet', () => {
    // deliberately not activating the source
    return delay(50).then(() => expect(dataSource.hasRefreshedAtLeastOnce()).to.be.false);
  });

  it('should know that at least one refresh has happened already', () => {
    dataSource.activate();
    return retry(() => expect(dataSource.hasRefreshedAtLeastOnce()).to.be.true);
  });

  it('should collect snapshot data', () => {
    dataSource.activate();
    return retry(() => {
      const rawData = dataSource.getRawData();
      expect(rawData.pid).to.be.a('number');
      expect(rawData.env).to.be.an('object');
      expect(rawData.exec).to.contain('node');
      expect(rawData.args).to.be.an('array');
      expect(rawData.user).to.be.a('string');
      expect(rawData.group).to.be.a('number');
      expect(rawData.start).to.a('number');
      expect(rawData.start).to.be.greaterThan(1588971164943);
    });
  });

  it('should emit firstRefresh event', () => {
    let emittedData;
    dataSource.on('firstRefresh', data => {
      emittedData = data;
    });
    dataSource.activate();

    return retry(() => {
      expect(emittedData).to.exist;
      expect(emittedData.pid).to.be.a('number');
      expect(emittedData.env).to.be.an('object');
      expect(emittedData.exec).to.contain('node');
      expect(emittedData.args).to.be.an('array');
      expect(emittedData.user).to.be.a('string');
      expect(emittedData.group).to.be.a('number');
      expect(emittedData.start).to.a('number');
      expect(emittedData.start).to.be.greaterThan(1588971164943);
    });
  });
});
