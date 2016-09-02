/* eslint-env mocha */

'use strict';

var agentStub = require('./agentStubControls');
var expect = require('chai').expect;


describe('agentStub', function() {
  agentStub.registerTestHooks();

  it('must respond without any discoveries upon start', function() {
    return agentStub.getDiscoveries()
      .then(function(discoveries) {
        expect(discoveries).to.deep.equal({});
      });
  });

  it('must respond without any data upon start', function() {
    return agentStub.getRetrievedData()
      .then(function(data) {
        expect(data).to.deep.equal({
          runtime: [],
          traces: []
        });
      });
  });
});
