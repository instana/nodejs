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
    agentControls: agentControls,
    env: {
      ENABLE_REPORT_UNCAUGHT_EXCEPTION: true
    }
  });
  serverControls.registerTestHooks();

  it('must finish the current span and mark it as an error', function() {
    return serverControls
      .sendRequest({
        method: 'GET',
        path: '/boom',
        simple: false,
        resolveWithFullResponse: true
      })
      .then(function(response) {
        assert.fail(response, 'no response', 'Unexpected response, server should have crashed.');
      })
      .catch(function(err) {
        expect(err.name).to.equal('RequestError');
        expect(err.message).to.equal('Error: socket hang up');
        return utils.retry(function() {
          return agentControls.getSpans().then(function(spans) {
            utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.server');
              expect(span.f.e).to.equal(String(serverControls.getPid()));
              expect(span.error).to.equal(true);
              expect(span.ec).to.equal(1);
              expect(JSON.stringify(span.stack)).to.contain('test/util/uncaught_exceptions/apps/server.js');
            });
          });
        });
      });
  });

  it('must report uncaught exception as an issue', function() {
    return serverControls
      .sendRequest({
        method: 'GET',
        path: '/boom',
        simple: false,
        resolveWithFullResponse: true
      })
      .then(function(response) {
        assert.fail(response, 'no response', 'Unexpected response, server should have crashed.');
      })
      .catch(function(err) {
        expect(err.name).to.equal('RequestError');
        expect(err.message).to.equal('Error: socket hang up');
        return utils.retry(function() {
          return agentControls.getEvents().then(function(events) {
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

  it('must block the dying process until termination', function() {
    var serverAcceptedAnotherResponse = false;
    var errorFromSecondHttpRequest = null;
    var triggerUncaughtException = serverControls.sendRequest({
      method: 'GET',
      path: '/boom',
      simple: false,
      resolveWithFullResponse: true
    });
    // send another request, this must never be accepted or processed
    serverControls
      .sendRequest({
        method: 'GET',
        path: '/other',
        simple: false
      })
      .then(function() {
        serverAcceptedAnotherResponse = true;
      })
      .catch(function(_errorFromSecondHttpRequest) {
        errorFromSecondHttpRequest = _errorFromSecondHttpRequest;
      });

    return triggerUncaughtException
      .then(function(response) {
        assert.fail(response, 'no response', 'Unexpected response, server should have crashed.');
      })
      .catch(function(err) {
        expect(err.name).to.equal('RequestError');
        expect(err.message).to.equal('Error: socket hang up');

        // Wait until the event has arrived and make sure that the other HTTP request has not been accepted/processed
        // in the meantime.
        return utils.retry(function() {
          return agentControls.getEvents().then(function(events) {
            expect(
              serverAcceptedAnotherResponse,
              "Unexpected response, server shouldn't have accepted another call."
            ).to.be.false;
            expect(errorFromSecondHttpRequest).to.exist;
            expect(errorFromSecondHttpRequest.message).to.equal('Error: read ECONNRESET');
            utils.expectOneMatching(events, function(event) {
              expect(event.title).to.equal('A Node.js process terminated abnormally due to an uncaught exception.');
              expect(event.text).to.contain('Boom');
            });
          });
        });
      });
  });
});
