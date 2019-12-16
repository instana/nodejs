'use strict';

const chai = require('chai');
const expect = chai.expect;

const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../core/test/config');
const utils = require('../../../core/test/utils');

describe('unhandled promise rejections', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  const agentControls = require('../apps/agentStubControls');
  const ServerControls = require('./apps/serverControls');

  this.timeout(config.getTestTimeout());

  agentControls.registerTestHooks();

  const serverControls = new ServerControls({
    agentControls,
    dontKillInAfterHook: false,
    env: {
      ENABLE_REPORT_UNCAUGHT_EXCEPTION: false,
      ENABLE_REPORT_UNHANDLED_REJECTIONS: true
    }
  });
  serverControls.registerTestHooks();

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
        return utils.retry(() =>
          agentControls.getSpans().then(spans => {
            utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.f.e).to.equal(String(serverControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.error).to.be.false;
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
        return utils.retry(() =>
          agentControls.getEvents().then(events => {
            utils.expectOneMatching(events, event => {
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
