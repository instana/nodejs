/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2015
 */

'use strict';

const proxyquire = require('proxyquire');
const expect = require('chai').expect;
const sinon = require('sinon');
const testUtils = require('@_local/core/test/test_util');

describe('pidStore', () => {
  let pidStore;
  let readFileSync;

  let prevCiFlag;

  beforeEach(() => {
    prevCiFlag = process.env.CONTINUOUS_INTEGRATION;
    delete process.env.CONTINUOUS_INTEGRATION;

    readFileSync = sinon.stub().throws();

    pidStore = null;
  });

  afterEach(() => {
    process.env.CONTINUOUS_INTEGRATION = prevCiFlag;
  });

  function doRequire() {
    pidStore = proxyquire('@_local/collector/src/pidStore', {
      '@_local/core': {
        uninstrumentedFs: { readFileSync }
      },
      './internalPidStore': {
        pid: process.pid
      }
    });

    pidStore.init({ logger: testUtils.createFakeLogger() });
  }

  it('should by default return the process pid', () => {
    doRequire();
    expect(pidStore.pid).to.equal(process.pid);
  });

  it('should allow changing the pid', () => {
    doRequire();
    const newPid = 42;
    pidStore.pid = newPid;
    expect(pidStore.pid).to.equal(newPid);
  });

  it('should provide means to observe pid changes', () => {
    doRequire();
    const observer = sinon.stub();
    pidStore.onPidChange(observer);

    const newPid = 512;
    pidStore.pid = newPid;

    expect(observer.callCount).to.equal(1);
    expect(observer.getCall(0).args[0]).to.equal(newPid);
  });

  it('should use the PID from the parent namespace when found', () => {
    readFileSync.returns(
      'node (15926, #threads: 10)\n-------------------------------------------------------------------\n' +
        'se.exec_start                                :    1093303068.953905'
    );
    doRequire();
    expect(pidStore.pid).to.equal(15926);
  });

  it('should not rely on specific command name', () => {
    readFileSync.returns(
      'ddasdasd\nsyslog-ng (19841, #threads: 1)\n' +
        '-------------------------------------------------------------------\n' +
        'se.exec_start                                :    1093303068.953905'
    );
    doRequire();
    expect(pidStore.pid).to.equal(19841);
  });

  it('should accept wider range of command names', () => {
    readFileSync.returns(
      'ui-client.sh (105065, #threads: 1)\n' +
        '-------------------------------------------------------------------\n' +
        'se.exec_start                                :    1093303068.953905'
    );
    doRequire();
    expect(pidStore.pid).to.equal(105065);
  });

  it('should not rely on specific command name', () => {
    readFileSync.returns('ddasdasd\n_-0918log-ng (1941, #threads: 1)\n§"!?=joidsajio90\n312903i .-.d-"');
    doRequire();
    expect(pidStore.pid).to.equal(1941);
  });

  it('should not fail when the sched file does not contain a parseable parent PID header', () => {
    readFileSync.returns('something which we cannot parse');
    doRequire();
    expect(pidStore.pid).to.equal(process.pid);
  });
});
