/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const supportedVersion = require('@_local/core').tracing.supportedVersion;

const config = require('@_local/core/test/config');
const testUtils = require('@_local/core/test/test_util');
const globalAgent = require('../../../globalAgent');

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('tracing/logging/misc/reinit-setLogger', function () {
  this.timeout(config.getTestTimeout());

  globalAgent.setUpCleanUpHooks();
  const expressControls = require('../../../apps/expressControls');
  const dummyLogFile = path.join(os.tmpdir(), 'instana-nodejs-dummy-test.log');

  before(async () => {
    await expressControls.start({ useGlobalAgent: true });
  });

  beforeEach(async () => {
    await globalAgent.instance.clearReceivedTraceData();
  });

  after(async () => {
    await expressControls.stop();
  });

  afterEach(() => {
    fs.unlinkSync(dummyLogFile);
  });

  it('must reinitialize all loggers on setLogger', () => {
    setTimeout(() => expressControls.setLogger(false, dummyLogFile), 500);

    return testUtils.retry(
      () =>
        new Promise((resolve, reject) => {
          fs.readFile(dummyLogFile, 'utf-8', (err, data) => {
            if (err) {
              return reject(err);
            }
            // wait for arbitrary number of characters to be written
            if (data.length > 15) {
              resolve(data);
            } else {
              reject(new Error(`Did not log enough: ${data}`));
            }
          });
        })
    );
  });
});
