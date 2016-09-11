/* eslint-env mocha */

'use strict';

var config = require('../config');
var agentStubControls = require('./agentStubControls');
var expect = require('chai').expect;


describe('agentStub', function() {
  this.timeout(config.getTestTimeout());

  agentStubControls.registerTestHooks();

  it('must respond without any discoveries upon start', function() {
    return agentStubControls.getDiscoveries()
      .then(function(discoveries) {
        expect(discoveries).to.deep.equal({});
      });
  });

  it('must respond without any data upon start', function() {
    return agentStubControls.getRetrievedData()
      .then(function(data) {
        expect(data).to.deep.equal({
          runtime: [],
          traces: [],
          responses: []
        });
      });
  });

  it('must return requests when retrieving entity data', function() {
    var pid = 23;
    var params = {foo: 'bar'};
    return agentStubControls.simulateDiscovery(pid)
      .then(function() {
        return agentStubControls.addRequestForPid(pid, params);
      })
      .then(function() {
        return agentStubControls.addEntityData(pid, {});
      })
      .then(function(requests) {
        expect(requests).to.deep.equal([params]);
      });
  });
});
