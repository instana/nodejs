'use strict';

var expect = require('chai').expect;
var semver = require('semver');
var path = require('path');

var supportedVersion = require('../../src/tracing/index').supportedVersion;
var config = require('../config');
var utils = require('../utils');

describe('actions/source', function() {
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

  it('retrieve fully qualified source file', function() {
    var messageId = 'a';
    return agentStubControls
      .addRequestForPid(expressControls.getPid(), {
        action: 'node.source',
        messageId: messageId,
        args: {
          file: path.join(process.cwd(), 'node_modules', 'semver', 'semver.js')
        }
      })
      .then(function() {
        return utils.retry(function() {
          return agentStubControls.getResponses().then(function(responses) {
            utils.expectOneMatching(responses, function(response) {
              expect(response.messageId).to.equal(messageId);
              expect(response.data.data).to.be.a('string');
              expect(response.data.data).to.match(/SEMVER_SPEC_VERSION/i);
            });
          });
        });
      });
  });

  it('must allow package.json requests', function() {
    var messageId = 'a';
    return agentStubControls
      .addRequestForPid(expressControls.getPid(), {
        action: 'node.source',
        messageId: messageId,
        args: {
          file: path.join(process.cwd(), 'package.json')
        }
      })
      .then(function() {
        return utils.retry(function() {
          return agentStubControls.getResponses().then(function(responses) {
            utils.expectOneMatching(responses, function(response) {
              expect(response.messageId).to.equal(messageId);
              expect(response.data.data).to.be.a('string');
              expect(response.data.data).to.match(/"name": "instana-nodejs-sensor"/i);
            });
          });
        });
      });
  });

  it('must not allow JSON requests', function() {
    var messageId = 'a';
    return agentStubControls
      .addRequestForPid(expressControls.getPid(), {
        action: 'node.source',
        messageId: messageId,
        args: {
          file: path.join(process.cwd(), 'foo.json')
        }
      })
      .then(function() {
        return utils.retry(function() {
          return agentStubControls.getResponses().then(function(responses) {
            utils.expectOneMatching(responses, function(response) {
              expect(response.messageId).to.equal(messageId);
              expect(response.data.error).to.match(/JavaScript file/i);
            });
          });
        });
      });
  });
});
