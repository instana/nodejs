/* eslint-env mocha */

'use strict';

var sinon = require('sinon');
var expect = require('chai').expect;

var pidStore = require('./pidStore');

describe('pidStore', function() {
  it('should by default return the process pid', function() {
    expect(pidStore.pid).to.equal(process.pid);
  });

  it('should allow changing the pid', function() {
    var newPid = 42;
    pidStore.pid = newPid;
    expect(pidStore.pid).to.equal(newPid);
  });

  it('should provide means to observe pid changes', function() {
    var observer = sinon.stub();
    pidStore.onPidChange(observer);

    var newPid = 512;
    pidStore.pid = newPid;

    expect(observer.callCount).to.equal(1);
    expect(observer.getCall(0).args[0]).to.equal(newPid);
  });
});
