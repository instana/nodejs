/* eslint-env mocha */

'use strict';

var expect = require('chai').expect;
var proxyquire = require('proxyquire');
var sinon = require('sinon');

var doesV8ModuleExist;
try {
  require('v8');
  doesV8ModuleExist = true;
} catch (e) {
  doesV8ModuleExist = false;
}

describe('metrics.heapSpaces', function() {
  var v8;
  var heapSpaces;

  beforeEach(function() {
    v8 = {
      getHeapSpaceStatistics: sinon.stub()
    };
    heapSpaces = proxyquire('./heapSpaces', {
      'v8': v8
    });
  });

  afterEach(function() {
    heapSpaces.deactivate();
  });

  it('should export a heapSpaces payload prefix', function() {
    expect(heapSpaces.payloadPrefix).to.equal('heapSpaces');
  });

  it('should not fail when the sensor is activated in old Node versions', function() {
    delete v8.getHeapSpaceStatistics;

    heapSpaces.activate();

    expect(heapSpaces.currentPayload).to.deep.equal([]);
  });

  if (doesV8ModuleExist) {
    it('should gather heap space data', function() {
      v8.getHeapSpaceStatistics.returns([
        {name: 'some heap space'}
      ]);

      heapSpaces.activate();

      expect(heapSpaces.currentPayload).to.deep.equal([
        {name: 'some heap space'}
      ]);
    });
  }
});
