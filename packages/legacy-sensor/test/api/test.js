'use strict';

var expect = require('chai').expect;

var config = require('../../../collector/test/config');
var utils = require('../../../collector/test/utils');

describe('legacy sensor/API', function() {
  this.timeout(config.getTestTimeout());

  var agentControls = require('../../../collector/test/apps/agentStubControls');
  var AppControls = require('./controls');
  var appControls = new AppControls({
    agentControls: agentControls
  });

  agentControls.registerTestHooks();
  appControls.registerTestHooks();

  beforeEach(function() {
    return agentControls.waitUntilAppIsCompletelyInitialized(appControls.getPid());
  });

  it('all exports', function() {
    return utils.retry(function() {
      return appControls
        .sendRequest({
          method: 'GET',
          path: '/api'
        })
        .then(function(instana) {
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
        });
    });
  });
});
