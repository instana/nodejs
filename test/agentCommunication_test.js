'use strict';

var expect = require('chai').expect;
var semver = require('semver');

var config = require('./config');
var utils = require('./utils');

describe('agentCommunication', function() {
  if (semver.satisfies(process.versions.node, '<4')) {
    return;
  }

  // controls require features that aren't available in early Node.js versions
  var agentStubControls = require('./apps/agentStubControls');
  var expressControls = require('./apps/expressControls');

  this.timeout(config.getTestTimeout());

  agentStubControls.registerTestHooks();
  expressControls.registerTestHooks();

  it('must announce itself to the agent', function() {
    return utils.retry(function() {
      return agentStubControls.getDiscoveries().then(function(discoveries) {
        var discovery = discoveries[expressControls.getPid()];
        expect(discovery.pid).to.be.a('number');
        expect(discovery.fd).to.be.a('string');
        if (/linux/i.test(process.platform)) {
          expect(discovery.inode).to.be.a('string');
        }
      });
    });
  });

  it('must send data to the agent', function() {
    return utils.retry(function() {
      return agentStubControls.getLastMetricValue(expressControls.getPid(), ['pid']).then(function(pid) {
        expect(pid).to.equal(expressControls.getPid());
      });
    });
  });

  it('must reannounce itself to the agent once discoveries are cleared', function() {
    return utils
      .retry(function() {
        return agentStubControls.getDiscoveries().then(function(discoveries) {
          expect(discoveries[expressControls.getPid()].pid).to.be.a('number');
        });
      })
      .then(function() {
        agentStubControls.deleteDiscoveries();
      })
      .then(function() {
        return utils.retry(function() {
          return agentStubControls.getDiscoveries().then(function(discoveries) {
            expect(discoveries[expressControls.getPid()].pid).to.be.a('number');
          });
        });
      });
  });
});
