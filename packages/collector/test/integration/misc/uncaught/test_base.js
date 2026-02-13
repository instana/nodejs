/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const chai = require('chai');
const expect = chai.expect;

const config = require('@_local/core/test/config');
const testUtils = require('@_local/core/test/test_util');
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');
const { AgentStubControls } = require('@_local/collector/test/apps/agentStubControls');

module.exports = function () {
  this.timeout(config.getTestTimeout());

  const agentControls = new AgentStubControls();

  let serverControls;

  before(async () => {
    await agentControls.startAgent();

    serverControls = new ProcessControls({
      dirname: __dirname,
      appName: 'server',
      dontKillInAfterHook: false,
      agentControls,
      env: {
        ENABLE_REPORT_UNHANDLED_REJECTIONS: true
      }
    });

    await serverControls.start();
  });

  beforeEach(async () => {
    await agentControls.clearReceivedTraceData();
  });

  after(async () => {
    await serverControls.stop();
    await agentControls.stopAgent();
  });

  afterEach(async () => {
    await serverControls.clearIpcMessages();
  });

  it('must not interfere with tracing', () =>
    serverControls
      .sendRequest({
        method: 'GET',
        path: '/reject-with-error-reason',
        simple: false
      })
      .then(response => {
        expect(response).to.equal('Rejected.');

        return testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.f.e).to.equal(String(serverControls.getPid())),
              span => expect(span.f.h).to.equal('agent-stub-uuid'),
              span => expect(span.error).to.not.exist,
              span => expect(span.ec).to.equal(0),
              span => expect(span.stack).to.be.empty
            ]);
          })
        );
      }));

  it('must be reported as an issue', () =>
    serverControls
      .sendRequest({
        method: 'GET',
        path: '/reject-with-error-reason',
        simple: false
      })
      .then(response => {
        expect(response).to.equal('Rejected.');

        return testUtils.retry(() =>
          agentControls.getEvents().then(events => {
            testUtils.expectAtLeastOneMatching(events, [
              event => expect(event.title).to.equal('An unhandled promise rejection occured in a Node.js process.'),
              event => expect(event.text).to.contain('Unhandled Promise Rejection'),
              event => expect(event.text).to.contain('Stack:'),
              event =>
                expect(event.plugin).to.equal('com.instana.forge.infrastructure.runtime.nodejs.NodeJsRuntimePlatform'),
              event => expect(event.id).to.equal(serverControls.getPid()),
              event => expect(event.timestamp).to.exist,
              event => expect(event.duration).to.equal(1),
              event => expect(event.severity).to.equal(5)
            ]);
          })
        );
      }));

  it(
    'must handle promise rejections gracefully when the promise is rejected with a string value for the reason ' +
      'parameter',
    () =>
      serverControls
        .sendRequest({
          method: 'GET',
          path: '/reject-with-string-reason',
          simple: false
        })
        .then(response => {
          expect(response).to.equal('Rejected.');

          return testUtils.retry(() =>
            agentControls.getEvents().then(events => {
              testUtils.expectAtLeastOneMatching(events, [
                event => expect(event.title).to.equal('An unhandled promise rejection occured in a Node.js process.'),
                event => expect(event.text).to.equal('"rejecting a promise with a string value"'),
                event =>
                  expect(event.plugin).to.equal(
                    'com.instana.forge.infrastructure.runtime.nodejs.NodeJsRuntimePlatform'
                  ),
                event => expect(event.id).to.equal(serverControls.getPid()),
                event => expect(event.timestamp).to.exist,
                event => expect(event.duration).to.equal(1),
                event => expect(event.severity).to.equal(5)
              ]);
            })
          );
        })
  );

  it('must handle promise rejections gracefully when the promise is rejected without reason parameter', () =>
    serverControls
      .sendRequest({
        method: 'GET',
        path: '/reject-with-null-reason',
        simple: false
      })
      .then(response => {
        expect(response).to.equal('Rejected.');

        return testUtils.retry(() =>
          agentControls.getEvents().then(events => {
            testUtils.expectAtLeastOneMatching(events, [
              event => expect(event.title).to.equal('An unhandled promise rejection occured in a Node.js process.'),
              event =>
                expect(event.text).to.equal('No "reason" parameter has been provided when the promise was rejected.'),
              event =>
                expect(event.plugin).to.equal('com.instana.forge.infrastructure.runtime.nodejs.NodeJsRuntimePlatform'),
              event => expect(event.id).to.equal(serverControls.getPid()),
              event => expect(event.timestamp).to.exist,
              event => expect(event.duration).to.equal(1),
              event => expect(event.severity).to.equal(5)
            ]);
          })
        );
      }));
};
