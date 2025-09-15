/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const { expect } = require('chai');
const semver = require('semver');

const core = require('@instana/core');
const { delay, retry, createFakeLogger } = require('../../../core/test/test_util');
const testConfig = require('@instana/core/test/config');
const CoreDataSource = require('../../src/nodejs/CoreDataSource');

describe('core data source', function () {
  this.timeout(testConfig.getTestTimeout());

  let dataSource;
  before(() => {
    const logger = createFakeLogger();
    core.coreConfig.init(logger);
    const config = core.coreConfig.normalize();
    dataSource = new CoreDataSource(config);
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

  it('should collect snapshot data and metrics from core and shared metrics modules', () => {
    dataSource.activate();
    return retry(() => {
      const rawData = dataSource.getRawData();
      expect(semver.valid(rawData.sensorVersion)).to.exist;
      expect(rawData.versions).to.be.an('object');
      expect(rawData.activeHandles).to.be.a('number');
      expect(rawData.activeRequests).to.be.a('number');
      expect(rawData.args).to.be.an('array');
      expect(rawData.dependencies).to.be.an('object');
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
      expect(semver.valid(emittedData.sensorVersion)).to.exist;
      expect(emittedData.versions).to.be.an('object');
      expect(emittedData.activeHandles).to.be.a('number');
      expect(emittedData.activeRequests).to.be.a('number');
      expect(emittedData.args).to.be.an('array');
      expect(emittedData.dependencies).to.be.an('object');
    });
  });
});
