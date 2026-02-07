/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const { expect } = require('chai');

const { delay, retry } = require('../../../core/test/test_util');
const config = require('@_local/core/test/config');

const ProcessSnapshotDataSource = require('../../src/process/ProcessSnapshotDataSource');

describe('process snapshot data source', function () {
  this.timeout(config.getTestTimeout());

  let dataSource;
  beforeEach(() => {
    dataSource = new ProcessSnapshotDataSource();
  });

  afterEach(() => {
    dataSource.deactivate();
    dataSource.reset();
  });

  it('should know that no refresh has happened yet', () =>
    // deliberately not activating the source
    delay(50).then(() => expect(dataSource.hasRefreshedAtLeastOnce()).to.be.false));

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

  it('should use default container type and no host by default', () => {
    dataSource.activate();
    return retry(() => {
      const rawData = dataSource.getRawData();
      expect(rawData.containerType).to.equal('docker');
      expect(rawData['com.instana.plugin.host.name']).to.not.exist;
    });
  });

  it('should use provided container type and host name (via constructor)', () => {
    dataSource = new ProcessSnapshotDataSource('custom-container-type', 'custom-host-name');
    dataSource.activate();
    return retry(() => {
      const rawData = dataSource.getRawData();
      expect(rawData.containerType).to.equal('custom-container-type');
      expect(rawData['com.instana.plugin.host.name']).to.equal('custom-host-name');
    });
  });

  it('should use provided containerInstanceId and host name (via setExternalSnapshotData)', () => {
    dataSource.setExternalSnapshotData('12345', 'custom-host-name');
    dataSource.activate();
    return retry(() => {
      const rawData = dataSource.getRawData();
      expect(rawData.container).to.equal('12345');
      expect(rawData['com.instana.plugin.host.name']).to.equal('custom-host-name');
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
