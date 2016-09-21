'use strict';

var expect = require('chai').expect;
var path = require('path');

var supportsAsyncWrap = require('../../src/tracing/index').supportsAsyncWrap;
var expressControls = require('../apps/expressElasticsearchControls');
var agentStubControls = require('../apps/agentStubControls');
var config = require('../config');
var utils = require('../utils');


describe('actions/source', function() {
  this.timeout(config.getTestTimeout());

  agentStubControls.registerTestHooks();
  expressControls.registerTestHooks({
    enableTracing: supportsAsyncWrap(process.versions.node)
  });

  beforeEach(function() {
    return agentStubControls.waitUntilAppIsCompletelyInitialized(expressControls.getPid());
  });

  it('retrieve fully qualified source file', function() {
    var messageId = 'a';
    return agentStubControls.addRequestForPid(
      expressControls.getPid(),
      {
        action: 'node.source',
        messageId: messageId,
        args: {
          file: path.join(process.cwd(), 'node_modules', 'semver', 'semver.js')
        }
      }
    )
    .then(function() {
      return utils.retry(function() {
        return agentStubControls.getResponses()
        .then(function(responses) {
          utils.expectOneMatching(responses, function(response) {
            expect(response.messageId).to.equal(messageId);
            expect(response.data.data).to.be.a('string');
            expect(response.data.data).to.match(/SEMVER_SPEC_VERSION/i);
          });
        });
      });
    });
  });
});
