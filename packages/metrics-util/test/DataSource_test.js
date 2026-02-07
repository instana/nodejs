/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

/* eslint-disable no-use-before-define */

'use strict';

const { expect } = require('chai');
const { fail } = expect;

const config = require('@_local/core/test/config');
const { delay, retry } = require('../../core/test/test_util');

const DataSource = require('../src/DataSource');

describe('data source', function () {
  this.timeout(config.getTestTimeout());

  this.slow(1000);

  it('should not call doRefresh if not activated', () => {
    let refreshCounter = 0;

    const dataSource = new DataSource(20);
    dataSource.doRefresh = function () {
      refreshCounter++;
    };

    return delay(100).then(() => {
      expect(refreshCounter).to.equal(0);
    });
  });

  it('should call doRefresh if activated', () => {
    let refreshCounter = 0;

    const dataSource = new DataSource(20);
    dataSource.doRefresh = function () {
      refreshCounter++;
    };
    dataSource.activate();

    return retry(() => expect(refreshCounter).to.be.at.least(10));
  });

  it('should stop calling doRefresh once deactivated', () => {
    let refreshCounter = 0;
    let refreshCounterWhenStopped = -1;

    const dataSource = new DataSource(20);
    dataSource.doRefresh = function () {
      refreshCounter++;
    };
    dataSource.activate();

    return retry(() => {
      if (refreshCounter >= 10) {
        refreshCounterWhenStopped = refreshCounter;
        dataSource.deactivate();
      } else {
        fail('refresh counter has not been incremented yet');
      }
    })
      .then(() => delay(100))
      .then(() => expect(refreshCounter).to.equal(refreshCounterWhenStopped));
  });

  it('must ignore duplicated activation', () => {
    let refreshCounter = 0;

    const dataSource = new DataSource(10);
    dataSource.doRefresh = function () {
      refreshCounter++;
    };
    dataSource.activate();
    dataSource.activate();

    return delay(200).then(() => {
      expect(refreshCounter).to.be.at.least(13);
      expect(refreshCounter).to.be.at.most(24);
    });
  });

  it('must ignore duplicated deactivation', () => {
    let refreshCounter = 0;

    const dataSource = new DataSource(10);
    dataSource.doRefresh = function () {
      refreshCounter++;
    };
    dataSource.activate();

    return delay(50)
      .then(() => {
        dataSource.deactivate();
        return delay(50);
      })
      .then(() => {
        dataSource.deactivate();
        return delay(50);
      })
      .then(() => {
        expect(refreshCounter).to.be.a('number');
      });
  });

  it('should know that not a single refresh has happened yet', () => {
    const dataSource = new DummyDataSource(20);

    return delay(50).then(() => expect(dataSource.hasRefreshedAtLeastOnce()).to.be.false);
  });

  it('should know that at least one refresh has happened already', () => {
    const dataSource = new DummyDataSource(20);
    dataSource.activate();

    return retry(() => expect(dataSource.hasRefreshedAtLeastOnce()).to.be.true);
  });

  it('should emit firstRefresh event', () => {
    let emittedData;
    const dataSource = new DummyDataSource(20);
    dataSource.on('firstRefresh', data => {
      emittedData = { ...data };
    });
    dataSource.activate();

    return retry(() => {
      expect(emittedData).to.exist;
      expect(emittedData.refreshCounter).to.equal(1);
    });
  });

  it('should provide data', () => {
    const dataSource = new DummyDataSource(20);
    dataSource.activate();

    return retry(() => {
      const rawData = dataSource.getRawData();
      expect(rawData.refreshCounter).to.be.at.least(10);
    });
  });

  it('should reset', () => {
    const dataSource = new DummyDataSource(20);
    dataSource.activate();

    return retry(() => {
      const rawData = dataSource.getRawData();
      if (rawData.refreshCounter >= 2) {
        dataSource.deactivate();
        dataSource.reset();
      } else {
        fail('refresh counter has not been incremented yet');
      }
    })
      .then(() => delay(100))
      .then(() => {
        const rawDataAfterReset = dataSource.getRawData();
        expect(rawDataAfterReset).to.deep.equal({});
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
