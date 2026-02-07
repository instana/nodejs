/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const path = require('path');
const { fork } = require('child_process');
const { expect } = require('chai');

const portfinder = require('@_local/collector/test/test_util/portfinder');
const { delay, retry } = require('../../core/test/test_util');
const config = require('@_local/core/test/config');

const HttpDataSource = require('../src/HttpDataSource');

describe('HTTP data source', function () {
  this.timeout(config.getTestTimeout());
  this.slow(config.getTestTimeout() / 2);

  let metadataMockPort;
  let metadataMockUrl;
  let messagesFromMetadataMock = [];
  let metadataMock;
  let dataSource;

  before(() => {
    metadataMockPort = portfinder();
    metadataMockUrl = `http://localhost:${metadataMockPort}/metadata`;
    dataSource = new HttpDataSource(metadataMockUrl);

    messagesFromMetadataMock = [];
    metadataMock = fork(path.join(__dirname, './metadata_mock'), {
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

  afterEach(() => {
    dataSource.deactivate();
    dataSource.reset();
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

  it('should know that no refresh has happened yet', () =>
    // deliberately not activating the source
    delay(50).then(() => expect(dataSource.hasRefreshedAtLeastOnce()).to.be.false));

  it('should know that at least one refresh has happened already', () => {
    dataSource.activate();
    return retry(() => expect(dataSource.hasRefreshedAtLeastOnce()).to.be.true);
  });

  it('should poll target URL if activated', () => {
    dataSource.activate();
    return retry(() => {
      const rawData = dataSource.getRawData();
      expect(rawData.key).to.equal('value');
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
      expect(emittedData.key).to.equal('value');
    });
  });
});
