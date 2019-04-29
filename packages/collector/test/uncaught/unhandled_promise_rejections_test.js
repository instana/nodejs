'use strict';

var chai = require('chai');
var expect = chai.expect;

var supportedVersion = require('@instana/core').tracing.supportedVersion;
var config = require('../config');
var utils = require('../utils');

describe('unhandled promise rejections', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  var agentControls = require('../apps/agentStubControls');
  var ServerControls = require('./apps/serverControls');

  this.timeout(config.getTestTimeout());

  agentControls.registerTestHooks();

  var serverControls = new ServerControls({
    agentControls: agentControls,
    dontKillInAfterHook: false,
    env: {
      ENABLE_REPORT_UNCAUGHT_EXCEPTION: false,
      ENABLE_REPORT_UNHANDLED_REJECTIONS: true
    }
  });
  serverControls.registerTestHooks();

  it('must not interfere with tracing', function() {
    return serverControls
      .sendRequest({
        method: 'GET',
        path: '/reject',
        simple: false,
        resolveWithFullResponse: true
      })
      .then(function(response) {
        expect(response.body).to.equal('Rejected.');
        return utils.retry(function() {
          return agentControls.getSpans().then(function(spans) {
            utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.server');
              expect(span.f.e).to.equal(String(serverControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.error).to.be.false;
              expect(span.ec).to.equal(0);
              expect(span.stack).to.be.empty;
            });
          });
        });
      });
  });

  it('must be reported as an issue', function() {
    return serverControls
      .sendRequest({
        method: 'GET',
        path: '/reject',
        simple: false,
        resolveWithFullResponse: true
      })
      .then(function(response) {
        expect(response.body).to.equal('Rejected.');
        return utils.retry(function() {
          return agentControls.getEvents().then(function(events) {
            utils.expectOneMatching(events, function(event) {
              expect(event.title).to.equal('An unhandled promise rejection occured in a Node.js process.');
              expect(event.text).to.contain('Unhandled Promise Rejection');
              expect(event.plugin).to.equal('com.instana.forge.infrastructure.runtime.nodejs.NodeJsRuntimePlatform');
              expect(event.id).to.equal(serverControls.getPid());
              expect(event.timestamp).to.exist;
              expect(event.duration).to.equal(1);
              expect(event.severity).to.equal(5);
            });
          });
        });
      });
  });
});
