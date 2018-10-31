'use strict';

var expect = require('chai').expect;
var semver = require('semver');

var supportedVersion = require('../../src/tracing/index').supportedVersion;
var config = require('../config');
var utils = require('../utils');

describe('actions/getModuleAnalysis', function() {
  if (semver.satisfies(process.versions.node, '<4')) {
    return;
  }

  // controls require features that aren't available in early Node.js versions
  var expressControls = require('../apps/expressControls');
  var agentStubControls = require('../apps/agentStubControls');

  this.timeout(config.getTestTimeout());

  agentStubControls.registerTestHooks();
  expressControls.registerTestHooks({
    enableTracing: supportedVersion(process.versions.node)
  });

  beforeEach(function() {
    return agentStubControls.waitUntilAppIsCompletelyInitialized(expressControls.getPid());
  });

  it('must receive module analysis', function() {
    var messageId = 'a';
    return agentStubControls
      .addRequestForPid(expressControls.getPid(), {
        action: 'node.getModuleAnalysis',
        messageId: messageId,
        args: {}
      })
      .then(function() {
        return utils.retry(function() {
          return agentStubControls.getResponses().then(function(responses) {
            utils.expectOneMatching(responses, function(response) {
              expect(response.messageId).to.equal(messageId);
              expect(response.data.data.cwd).to.be.a('string');
              expect(response.data.data['require.main.filename']).to.be.a('string');
              expect(response.data.data['require.main.paths']).to.be.an('array');
              expect(response.data.data['require.cache']).to.be.an('array');
            });
          });
        });
      });
  });
});
