/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const { expect } = require('chai');

const { delay, retry } = require('@_local/core/test/test_util');
const config = require('@_local/core/test/config');

const ProcessMetricsSource = require('../../src/process/ProcessMetricsSource');

describe('process snapshot data source', function () {
  this.timeout(config.getTestTimeout());

  let dataSource;
  beforeEach(() => {
    dataSource = new ProcessMetricsSource();
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

  it('should collect metric data', () => {
    dataSource.activate();
    return retry(() => {
      const rawData = dataSource.getRawData();
      expect(rawData.timeDelta).to.be.at.least(950);
      expect(rawData.timeDelta).to.be.at.most(1100);
      expect(rawData.cpuUsageDiff).to.be.an('object');
      expect(rawData.cpuUsageDiff.user).to.be.a('number');
      expect(rawData.cpuUsageDiff.system).to.be.a('number');
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
      expect(emittedData.timeDelta).to.be.a('number');
      expect(emittedData.cpuUsageDiff).to.be.an('object');
    });
  });
});
