/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const expect = require('chai').expect;

const config = require('../../../core/test/config');
const testUtils = require('../../../core/test/test_util');
const ProcessControls = require('../../../collector/test/test_util/ProcessControls');
const AgentStubControls = require('../../../collector/test/apps/agentStubControls').AgentStubControls;

describe('legacy sensor/API', function () {
  this.timeout(config.getTestTimeout());

  const agentControls = new AgentStubControls(5210);
  agentControls.registerTestHooks();

  const controls = new ProcessControls({
    dirname: __dirname,
    port: 5215,
    agentControls
  }).registerTestHooks();

  it('all exports', () =>
    testUtils.retry(() =>
      controls
        .sendRequest({
          method: 'GET',
          path: '/api'
        })
        .then(instana => {
          expect(instana.currentSpan).to.equal('function');
          expect(instana.sdk.callback.startEntrySpan).to.equal('function');
          expect(instana.sdk.callback.completeEntrySpan).to.equal('function');
          expect(instana.sdk.callback.startIntermediateSpan).to.equal('function');
          expect(instana.sdk.callback.completeIntermediateSpan).to.equal('function');
          expect(instana.sdk.callback.startExitSpan).to.equal('function');
          expect(instana.sdk.callback.completeExitSpan).to.equal('function');
          expect(instana.sdk.promise.startEntrySpan).to.equal('function');
          expect(instana.sdk.promise.completeEntrySpan).to.equal('function');
          expect(instana.sdk.promise.startIntermediateSpan).to.equal('function');
          expect(instana.sdk.promise.completeIntermediateSpan).to.equal('function');
          expect(instana.sdk.promise.startExitSpan).to.equal('function');
          expect(instana.sdk.promise.completeExitSpan).to.equal('function');
          expect(instana.setLogger).to.equal('function');
          expect(instana.opentracing.init).to.equal('function');
          expect(instana.opentracing.createTracer).to.equal('function');
          expect(instana.opentracing.activate).to.equal('function');
          expect(instana.opentracing.deactivate).to.equal('function');
        })
    ));
});
