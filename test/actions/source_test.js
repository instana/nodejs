'use strict';

var expect = require('chai').expect;
var path = require('path');
var fs = require('fs');

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
    // var messageId = 'a';
    // return agentStubControls.addRequestForPid(
    //   expressElasticsearchControls.getPid(),
    //   {
    //     action: 'node.startCpuProfiling',
    //     messageId: messageId,
    //     args: {
    //       duration: 1000
    //     }
    //   }
    // )
    // .then(function() {
    //   return utils.retry(function() {
    //     return agentStubControls.getResponses()
    //     .then(function(responses) {
    //       utils.expectOneMatching(responses, function(response) {
    //         expect(response.messageId).to.equal(messageId);
    //         expect(response.data.data).to.match(/Profiling successfully started/i);
    //       });
    //
    //       utils.expectOneMatching(responses, function(response) {
    //         expect(response.messageId).to.equal(messageId);
    //         expect(response.data.data.f).to.equal('(root)');
    //         expect(response.data.data.sh).to.equal(0);
    //         expect(response.data.data.th).to.be.above(0);
    //         expect(response.data.data.t).to.equal(response.data.data.th * 1000);
    //       });
    //     });
    //   });
    // });
  });
});
