'use strict';

const expect = require('chai').expect;
const proxyquire = require('proxyquire');
const sinon = require('sinon');

let doesV8ModuleExist;
try {
  require('v8');
  doesV8ModuleExist = true;
} catch (e) {
  doesV8ModuleExist = false;
}

describe('metrics.heapSpaces', () => {
  let v8;
  let heapSpaces;

  beforeEach(() => {
    v8 = {
      getHeapSpaceStatistics: sinon.stub()
    };
    heapSpaces = proxyquire('../src/heapSpaces', {
      v8
    });
  });

  afterEach(() => {
    heapSpaces.deactivate();
  });

  it('should export a heapSpaces payload prefix', () => {
    expect(heapSpaces.payloadPrefix).to.equal('heapSpaces');
  });

  it('should not fail when the collector is activated in old Node versions', () => {
    delete v8.getHeapSpaceStatistics;

    heapSpaces.activate();

    expect(heapSpaces.currentPayload).to.deep.equal({});
  });

  if (doesV8ModuleExist) {
    it('should gather heap space data', () => {
      v8.getHeapSpaceStatistics.returns([
        {
          space_name: 'new_space',
          space_size: 2063872,
          space_used_size: 951112,
          space_available_size: 80824,
          physical_space_size: 2063872
        }
      ]);

      heapSpaces.activate();

      expect(heapSpaces.currentPayload).to.deep.equal({
        new_space: {
          current: 2063872,
          available: 80824,
          used: 951112,
          physical: 2063872
        }
      });
    });
  }
});
