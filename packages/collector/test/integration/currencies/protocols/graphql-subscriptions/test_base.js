/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const expect = require('chai').expect;

const config = require('@_local/core/test/config');
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');
const globalAgent = require('@_local/collector/test/globalAgent');

let libraryEnv;

function start() {
  this.timeout(config.getTestTimeout());

  globalAgent.setUpCleanUpHooks();
  let controls;

  before(async () => {
    controls = new ProcessControls({
      dirname: __dirname,
      useGlobalAgent: true,
      env: {
        ...libraryEnv
      }
    });

    await controls.startAndWaitForAgentConnection();
  });

  beforeEach(async () => {
    await globalAgent.instance.clearReceivedTraceData();
  });

  after(async () => {
    await controls.stop();
  });

  afterEach(async () => {
    await controls.clearIpcMessages();
  });

  it('should keep cls context when pulling before pushing', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/pull-before-push'
      })
      .then(valuesReadFromCls => {
        expect(valuesReadFromCls).to.have.lengthOf(3);
        expect(valuesReadFromCls[0]).to.equal('test-value');
        expect(valuesReadFromCls[1]).to.equal('test-value');
        expect(valuesReadFromCls[2]).to.equal('test-value');
      }));
}

module.exports = function (name, version, isLatest) {
  libraryEnv = { LIBRARY_VERSION: version, LIBRARY_NAME: name, LIBRARY_LATEST: isLatest };
  return start.call(this);
};
