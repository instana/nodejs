'use strict';

const semver = require('semver');
const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;

const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../config');
const utils = require('../utils');

describe('uncaught exceptions', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }
  if (semver.satisfies(process.versions.node, '>=12.0.0')) {
    // TODO Skipping test, netlinkwrapper needs to be updated for Node.js 12.
    return;
  }

  const agentControls = require('../apps/agentStubControls');
  const ServerControls = require('./apps/serverControls');

  this.timeout(config.getTestTimeout());

  agentControls.registerTestHooks();

  const serverControls = new ServerControls({
    agentControls,
    env: {
      ENABLE_REPORT_UNCAUGHT_EXCEPTION: true,
      ENABLE_REPORT_UNHANDLED_REJECTIONS: false
    }
  });
  serverControls.registerTestHooks();

  it('must finish the current span and mark it as an error', () =>
    serverControls
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
        return utils.retry(() =>
          agentControls.getSpans().then(spans => {
            utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.f.e).to.equal(String(serverControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.error).to.equal(true);
              expect(span.ec).to.equal(1);
              expect(JSON.stringify(span.stack)).to.contain('test/uncaught/apps/server.js');
            });
          })
        );
      }));

  it('must be reported as an issue', () =>
    serverControls
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
        return utils.retry(() =>
          agentControls.getEvents().then(events => {
            utils.expectOneMatching(events, event => {
              expect(event.title).to.equal('A Node.js process terminated abnormally due to an uncaught exception.');
              expect(event.text).to.contain('Boom');
              expect(event.plugin).to.equal('com.instana.forge.infrastructure.runtime.nodejs.NodeJsRuntimePlatform');
              expect(event.id).to.equal(serverControls.getPid());
              expect(event.timestamp).to.exist;
              expect(event.duration).to.equal(1);
              expect(event.severity).to.equal(10);
            });
          })
        );
      }));

  it('must block the dying process until termination', () => {
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
        return utils.retry(() =>
          agentControls.getEvents().then(events => {
            expect(serverAcceptedAnotherResponse, "Unexpected response, server shouldn't have accepted another call.")
              .to.be.false;
            expect(errorFromSecondHttpRequest).to.exist;
            expect(errorFromSecondHttpRequest.message).to.equal('Error: read ECONNRESET');
            utils.expectOneMatching(events, event => {
              expect(event.title).to.equal('A Node.js process terminated abnormally due to an uncaught exception.');
              expect(event.text).to.contain('Boom');
            });
          })
        );
      });
  });
});
