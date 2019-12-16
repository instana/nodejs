'use strict';

const expect = require('chai').expect;

const config = require('../../../core/test/config');
const utils = require('../../../core/test/utils');

describe('legacy sensor/API', function() {
  this.timeout(config.getTestTimeout());

  const agentControls = require('../../../collector/test/apps/agentStubControls');
  const AppControls = require('./controls');
  const appControls = new AppControls({
    agentControls
  });

  agentControls.registerTestHooks();
  appControls.registerTestHooks();

  beforeEach(() => agentControls.waitUntilAppIsCompletelyInitialized(appControls.getPid()));

  it('all exports', () =>
    utils.retry(() =>
      appControls
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
