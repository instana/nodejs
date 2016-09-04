'use strict';

var expect = require('chai').expect;

var agentStubControls = require('./apps/agentStubControls');
var expressControls = require('./apps/expressControls');
var config = require('./config');
var utils = require('./utils');

describe('agentCommunication', function() {
  this.timeout(config.getTestTimeout());

  agentStubControls.registerTestHooks();
  expressControls.registerTestHooks();

  it('must announce itself to the agent', function() {
    return utils.retry(function() {
      return agentStubControls.getDiscoveries()
      .then(function(discoveries) {
        expect(discoveries[expressControls.getPid()].pid).to.be.a('number');
      });
    });
  });


  it('must send data to the agent', function() {
    return utils.retry(function() {
      return agentStubControls.getLastMetricValue(expressControls.getPid(), ['pid'])
      .then(function(pid) {
        expect(pid).to.equal(expressControls.getPid());
      });
    });
  });


  it('must reannounce itself to the agent once discoveries are cleared', function() {
    return utils.retry(function() {
      return agentStubControls.getDiscoveries()
      .then(function(discoveries) {
        expect(discoveries[expressControls.getPid()].pid).to.be.a('number');
      });
    })
    .then(function() {
      agentStubControls.deleteDiscoveries();
    })
    .then(function() {
      return utils.retry(function() {
        return agentStubControls.getDiscoveries()
        .then(function(discoveries) {
          expect(discoveries[expressControls.getPid()].pid).to.be.a('number');
        });
      });
    });
  });
});
