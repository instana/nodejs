/* eslint-env mocha */

'use strict';

var expect = require('chai').expect;

var config = require('./config');
var util = require('./util');
var agentStubControls = require('./apps/agentStubControls');
var expressControls = require('./apps/expressControls');

describe('agentCommunication', function() {
  this.timeout(config.getTestTimeout());

  agentStubControls.registerTestHooks();
  expressControls.registerTestHooks();

  it('must announce itself to the agent', function() {
    var expectedPid = expressControls.getPid();

    return util.retry(function() {
      return agentStubControls.getDiscoveries()
        .then(function(discoveries) {
          expect(discoveries[expectedPid].pid).to.be.a('number');
        });
    });
  });
});
