'use strict';

var expect = require('chai').expect;
var semver = require('semver');
var path = require('path');
var fs = require('fs');

var supportedVersion = require('../../../src/tracing/index').supportedVersion;
var cpu = require('../../../src/actions/profiling/cpu');
var config = require('../../config');
var utils = require('../../utils');

describe('actions/profiling/cpu', function() {
  if (!semver.satisfies(process.versions.node, '>=4.0.0')) {
    return;
  }

  // controls require features that aren't available in early Node.js versions
  var elasticSearchControls = require('../../tracing/database/elasticsearch/controls');
  var agentStubControls = require('../../apps/agentStubControls');

  describe('toTreeWithTiming', function() {
    var rawCpuProfile;

    beforeEach(function() {
      rawCpuProfile = JSON.parse(fs.readFileSync(path.join(__dirname, 'cpuProfile.json'), { encoding: 'utf8' }));
    });

    it('must turn the raw CPU profile into a tree with timing information', function() {
      var root = cpu.toTreeWithTiming(rawCpuProfile, 1000);
      expect(root.f).to.equal('(root)');

      var firstChild = root.c[0];
      expect(firstChild.f).to.equal('');
      expect(firstChild.u).to.equal('node.js');
      expect(firstChild.l).to.equal(10);
    });

    it('must calculate timing information based on sampling interval', function() {
      var root = cpu.toTreeWithTiming(rawCpuProfile, 100);
      expect(root.sh).to.equal(0);
      expect(root.th).to.equal(3799);

      expect(root.s).to.equal(0);
      expect(root.t).to.equal(3799000);
    });

    it('must shorten bailout reasons', function() {
      var firstChild = cpu.toTreeWithTiming(rawCpuProfile, 100).c[0];
      expect(firstChild.b).to.equal(undefined);
    });
  });

  describe('integration-test', function() {
    this.timeout(config.getTestTimeout());

    agentStubControls.registerTestHooks();
    elasticSearchControls.registerTestHooks({
      enableTracing: supportedVersion(process.versions.node)
    });

    beforeEach(function() {
      return agentStubControls.waitUntilAppIsCompletelyInitialized(elasticSearchControls.getPid());
    });

    it('must inform about start of CPU profile', function() {
      var messageId = 'a';
      return agentStubControls
        .addRequestForPid(elasticSearchControls.getPid(), {
          action: 'node.startCpuProfiling',
          messageId: messageId,
          args: {
            duration: 1000
          }
        })
        .then(function() {
          return utils.retry(function() {
            return agentStubControls.getResponses().then(function(responses) {
              utils.expectOneMatching(responses, function(response) {
                expect(response.messageId).to.equal(messageId);
                expect(response.data.data).to.match(/Profiling successfully started/i);
              });

              utils.expectOneMatching(responses, function(response) {
                expect(response.messageId).to.equal(messageId);
                expect(response.data.data.f).to.equal('(root)');
                expect(response.data.data.sh).to.equal(0);
                expect(response.data.data.th).to.be.above(0);
                expect(response.data.data.t).to.equal(response.data.data.th * 1000);
              });
            });
          });
        });
    });

    it('must stop running CPU profiles and provide the results', function() {
      var startMessageId = 'start';
      var stopMessageId = 'stop';
      return agentStubControls
        .addRequestForPid(elasticSearchControls.getPid(), {
          action: 'node.startCpuProfiling',
          messageId: startMessageId,
          args: {
            duration: 6000000
          }
        })
        .then(function() {
          return agentStubControls.addRequestForPid(elasticSearchControls.getPid(), {
            action: 'node.stopCpuProfiling',
            messageId: stopMessageId,
            args: {}
          });
        })
        .then(function() {
          return utils.retry(function() {
            return agentStubControls.getResponses().then(function(responses) {
              utils.expectOneMatching(responses, function(response) {
                expect(response.messageId).to.equal(stopMessageId);
                expect(response.data.data).to.match(/CPU profiling successfully stopped/i);
              });

              utils.expectOneMatching(responses, function(response) {
                expect(response.messageId).to.equal(startMessageId);
                expect(response.data.data).to.match(/Profiling successfully started/i);
              });

              utils.expectOneMatching(responses, function(response) {
                expect(response.messageId).to.equal(startMessageId);
                expect(response.data.data.f).to.equal('(root)');
              });
            });
          });
        });
    });

    it('must abort running CPU profiles', function() {
      var startMessageId = 'start';
      var stopMessageId = 'stop';
      return agentStubControls
        .addRequestForPid(elasticSearchControls.getPid(), {
          action: 'node.startCpuProfiling',
          messageId: startMessageId,
          args: {
            duration: 6000000
          }
        })
        .then(function() {
          return agentStubControls.addRequestForPid(elasticSearchControls.getPid(), {
            action: 'node.stopCpuProfiling',
            messageId: stopMessageId,
            args: {
              abort: true
            }
          });
        })
        .then(function() {
          return utils.retry(function() {
            return agentStubControls.getResponses().then(function(responses) {
              utils.expectOneMatching(responses, function(response) {
                expect(response.messageId).to.equal(stopMessageId);
                expect(response.data.data).to.match(/CPU profiling successfully aborted/i);
              });

              utils.expectOneMatching(responses, function(response) {
                expect(response.messageId).to.equal(startMessageId);
                expect(response.data.data).to.match(/Profiling successfully started/i);
              });
            });
          });
        });
    });

    it('must do nothing when there is no active CPU profile', function() {
      var stopMessageId = 'stop';
      return agentStubControls
        .addRequestForPid(elasticSearchControls.getPid(), {
          action: 'node.stopCpuProfiling',
          messageId: stopMessageId,
          args: {
            abort: true
          }
        })
        .then(function() {
          return utils.retry(function() {
            return agentStubControls.getResponses().then(function(responses) {
              utils.expectOneMatching(responses, function(response) {
                expect(response.messageId).to.equal(stopMessageId);
                expect(response.data.data).to.match(/No active CPU profiling session found/i);
              });
            });
          });
        });
    });
  });
});
