'use strict';

const path = require('path');
const chai = require('chai');
const expect = chai.expect;

const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../core/test/config');
const testUtils = require('../../../core/test/test_util');
const ProcessControls = require('../test_util/ProcessControls');

describe('unhandled promise rejections', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  const agentControls = require('../apps/agentStubControls');

  this.timeout(config.getTestTimeout());

  agentControls.registerTestHooks();

  const serverControls = new ProcessControls({
    appPath: path.join(__dirname, 'apps', 'server'),
    dontKillInAfterHook: false,
    agentControls,
    env: {
      ENABLE_REPORT_UNCAUGHT_EXCEPTION: false,
      ENABLE_REPORT_UNHANDLED_REJECTIONS: true
    }
  }).registerTestHooks();

  it('must not interfere with tracing', () =>
    serverControls
      .sendRequest({
        method: 'GET',
        path: '/reject',
        simple: false,
        resolveWithFullResponse: true
      })
      .then(response => {
        expect(response.body).to.equal('Rejected.');
        return testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            testUtils.expectAtLeastOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.f.e).to.equal(String(serverControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(0);
              expect(span.stack).to.be.empty;
            });
          })
        );
      }));

  it('must be reported as an issue', () =>
    serverControls
      .sendRequest({
        method: 'GET',
        path: '/reject',
        simple: false,
        resolveWithFullResponse: true
      })
      .then(response => {
        expect(response.body).to.equal('Rejected.');
        return testUtils.retry(() =>
          agentControls.getEvents().then(events => {
            testUtils.expectAtLeastOneMatching(events, event => {
              expect(event.title).to.equal('An unhandled promise rejection occured in a Node.js process.');
              expect(event.text).to.contain('Unhandled Promise Rejection');
              expect(event.plugin).to.equal('com.instana.forge.infrastructure.runtime.nodejs.NodeJsRuntimePlatform');
              expect(event.id).to.equal(serverControls.getPid());
              expect(event.timestamp).to.exist;
              expect(event.duration).to.equal(1);
              expect(event.severity).to.equal(5);
            });
          })
        );
      }));
});
