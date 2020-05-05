'use strict';

const path = require('path');
const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;

const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../core/test/config');
const testUtils = require('../../../core/test/test_util');
const ProcessControls = require('../test_util/ProcessControls');

describe('uncaught exceptions', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  const agentControls = require('../apps/agentStubControls');

  this.timeout(config.getTestTimeout() * 2);

  agentControls.registerTestHooks();

  const serverControls = new ProcessControls({
    appPath: path.join(__dirname, 'apps', 'server'),
    dontKillInAfterHook: true,
    agentControls,
    env: {
      ENABLE_REPORT_UNCAUGHT_EXCEPTION: true,
      ENABLE_REPORT_UNHANDLED_REJECTIONS: false
    }
  }).registerTestHooks();

  it('must finish the current span and mark it as an error', function() {
    return serverControls
      .sendRequest({
        method: 'GET',
        path: '/boom',
        simple: false,
        resolveWithFullResponse: true
      })
      .then(response => {
        assert.fail(response, 'no response', 'Unexpected response, server should have crashed.');
      })
      .catch(err => {
        expect(err.name).to.equal('RequestError');
        expect(err.message).to.equal('Error: socket hang up');
        return testUtils.retry(
          () =>
            agentControls.getSpans().then(spans => {
              return testUtils.expectAtLeastOneMatching(spans, span => {
                expect(span.n).to.equal('node.http.server');
                expect(span.f.e).to.equal(String(serverControls.getPid()));
                expect(span.f.h).to.equal('agent-stub-uuid');
                expect(span.error).to.not.exist;
                expect(span.ec).to.equal(1);
                expect(JSON.stringify(span.stack)).to.contain('test/uncaught/apps/server.js');
              });
            }),
          this.timeout() * 0.8
        );
      });
  });

  it('must be reported as an issue', function() {
    return serverControls
      .sendRequest({
        method: 'GET',
        path: '/boom',
        simple: false,
        resolveWithFullResponse: true
      })
      .then(response => {
        assert.fail(response, 'no response', 'Unexpected response, server should have crashed.');
      })
      .catch(err => {
        expect(err.name).to.equal('RequestError');
        expect(err.message).to.equal('Error: socket hang up');
        return testUtils.retry(
          () =>
            agentControls.getEvents().then(events => {
              testUtils.expectAtLeastOneMatching(events, event => {
                expect(event.title).to.equal('A Node.js process terminated abnormally due to an uncaught exception.');
                expect(event.text).to.contain('Boom');
                expect(event.plugin).to.equal('com.instana.forge.infrastructure.runtime.nodejs.NodeJsRuntimePlatform');
                expect(event.id).to.equal(serverControls.getPid());
                expect(event.timestamp).to.exist;
                expect(event.duration).to.equal(1);
                expect(event.severity).to.equal(10);
              });
            }),
          this.timeout() * 0.8
        );
      });
  });

  it('must block the dying process until termination', function() {
    let serverAcceptedAnotherResponse = false;
    let errorFromSecondHttpRequest = null;
    const triggerUncaughtException = serverControls.sendRequest({
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
      .then(() => {
        serverAcceptedAnotherResponse = true;
      })
      .catch(_errorFromSecondHttpRequest => {
        errorFromSecondHttpRequest = _errorFromSecondHttpRequest;
      });

    return triggerUncaughtException
      .then(response => {
        assert.fail(response, 'no response', 'Unexpected response, server should have crashed.');
      })
      .catch(err => {
        expect(err.name).to.equal('RequestError');
        expect(err.message).to.equal('Error: socket hang up');

        // Wait until the event has arrived and make sure that the other HTTP request has not been accepted/processed
        // in the meantime.
        return testUtils.retry(
          () =>
            agentControls.getEvents().then(events => {
              expect(serverAcceptedAnotherResponse, "Unexpected response, server shouldn't have accepted another call.")
                .to.be.false;
              expect(errorFromSecondHttpRequest).to.exist;
              expect(errorFromSecondHttpRequest.message).to.equal('Error: read ECONNRESET');
              testUtils.expectAtLeastOneMatching(events, event => {
                expect(event.title).to.equal('A Node.js process terminated abnormally due to an uncaught exception.');
                expect(event.text).to.contain('Boom');
              });
            }),
          this.timeout() * 0.8
        );
      });
  });
});
