'use strict';

var chai = require('chai');
var expect = chai.expect;
var assert = chai.assert;

var supportedVersion = require('../../../src/tracing/index').supportedVersion;
var config = require('../../config');
var utils = require('../../utils');

describe('uncaught exceptions', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  var agentControls = require('../../apps/agentStubControls');
  var ServerControls = require('./apps/serverControls');

  this.timeout(config.getTestTimeout());

  agentControls.registerTestHooks();

  var serverControls = new ServerControls({
    agentControls: agentControls
  });
  serverControls.registerTestHooks();

  it('must finish the current span and mark it as an error', function() {
    return serverControls.sendRequest({
      method: 'GET',
      path: '/boom',
      simple: false,
      resolveWithFullResponse: true
    })
    .then(function(response) {
      assert.fail(response, 'no response', 'Unexpected response, server should have crashed');
    })
    .catch(function(err) {
      expect(err.name).to.equal('RequestError');
      expect(err.message).to.equal('Error: socket hang up');
      return utils.retry(function() {
        return agentControls.getSpans()
        .then(function(spans) {
          utils.expectOneMatching(spans, function(span) {
            expect(span.n).to.equal('node.http.server');
            expect(span.f.e).to.equal(String(serverControls.getPid()));
            expect(span.error).to.equal(true);
            expect(span.ec).to.equal(1);
            expect(JSON.stringify(span.stack)).to.contain('test/util/uncaughtExceptions/apps/server.js');
          });
        });
      });
    });
  });

  it('must report uncaught exception as an issue', function() {
    return serverControls.sendRequest({
      method: 'GET',
      path: '/boom',
      simple: false,
      resolveWithFullResponse: true
    })
    .then(function(response) {
      assert.fail(response, 'no response', 'Unexpected response, server should have crashed');
    })
    .catch(function(err) {
      expect(err.name).to.equal('RequestError');
      expect(err.message).to.equal('Error: socket hang up');
      return utils.retry(function() {
        return agentControls.getEvents()
        .then(function(events) {
          utils.expectOneMatching(events, function(event) {
            expect(event.title).to.equal('A Node.js process terminated abnormally due to an uncaught exception.');
            expect(event.text).to.contain('Boom');
            expect(event.plugin).to.equal('com.instana.forge.infrastructure.runtime.nodejs.NodeJsRuntimePlatform');
            expect(event.id).to.equal(serverControls.getPid());
            expect(event.timestamp).to.exist;
            expect(event.duration).to.equal(1);
            expect(event.severity).to.equal(10);
          });
        });
      });
    });
  });
});
