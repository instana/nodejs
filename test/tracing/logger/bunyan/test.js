'use strict';

var expect = require('chai').expect;

var supportedVersion = require('../../../../src/tracing/index').supportedVersion;
var config = require('../../../config');
var utils = require('../../../utils');

describe('tracing/logger/bunyan', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  this.timeout(config.getTestTimeout());
  var agentControls = require('../../../apps/agentStubControls');
  var appControls = require('./controls');

  describe('trace log calls', function() {
    agentControls.registerTestHooks();
    appControls.registerTestHooks();

    beforeEach(function() {
      return agentControls.waitUntilAppIsCompletelyInitialized(appControls.getPid());
    });

    it('must not trace info', function() {
      return appControls.trigger('info').then(function() {
        return utils.retry(function() {
          return agentControls.getSpans().then(function(spans) {
            var entrySpan = utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.server');
              expect(span.f.e).to.equal(String(appControls.getPid()));
            });
            utils.expectOneMatching(spans, function(span) {
              checkNextExitSpan(span, entrySpan);
            });
            var bunyanSpans = utils.getSpansByName(spans, 'log.bunyan');
            expect(bunyanSpans).to.be.empty;
          });
        });
      });
    });

    it('must trace warn', function() {
      return runTest('warn', false, 'Warn message - should be traced.');
    });

    it('must trace error', function() {
      return runTest('error', true, 'Error message - should be traced.');
    });

    it('must trace fatal', function() {
      return runTest('fatal', true, 'Fatal message - should be traced.');
    });

    it('must trace error object without message', function() {
      return runTest('error-object-only', true, 'This is an error.');
    });

    it('must not serialize random object', function() {
      return runTest(
        'error-random-object-only',
        true,
        'Log call without message. ' +
          'The Bunyan "fields" argument will not be serialized by Instana for performance reasons.'
      );
    });

    it('must trace error object and string', function() {
      return runTest('error-object-and-string', true, 'This is an error. -- Error message - should be traced.');
    });

    it('must trace random object and string', function() {
      return runTest('error-random-object-and-string', true, 'Error message - should be traced.');
    });

    it('must trace child logger error', function() {
      return runTest('child-error', true, 'Child logger error message - should be traced.');
    });
  });

  // verify that Instana's own Bunyan logging does not get traced
  describe('do not trace Instana log calls', function() {
    describe('Instana creates a new Bunyan logger', function() {
      agentControls.registerTestHooks();
      appControls.registerTestHooks({
        instanaLoggingMode: 'instana-creates-bunyan-logger'
      });

      beforeEach(function() {
        return agentControls.waitUntilAppIsCompletelyInitialized(appControls.getPid());
      });

      it('log calls are not traced', function() {
        return verifyInstanaLoggingIsNotTraced();
      });
    });

    describe('Instana receives a Bunyan logger', function() {
      agentControls.registerTestHooks();
      appControls.registerTestHooks({
        instanaLoggingMode: 'instana-receives-bunyan-logger'
      });

      beforeEach(function() {
        return agentControls.waitUntilAppIsCompletelyInitialized(appControls.getPid());
      });

      it('log calls are not traced', function() {
        return verifyInstanaLoggingIsNotTraced();
      });
    });

    describe('Instana receives a non-Bunyan logger', function() {
      agentControls.registerTestHooks();
      appControls.registerTestHooks({
        instanaLoggingMode: 'instana-receives-non-bunyan-logger'
      });

      beforeEach(function() {
        return agentControls.waitUntilAppIsCompletelyInitialized(appControls.getPid());
      });

      it('log calls are not traced', function() {
        return verifyInstanaLoggingIsNotTraced();
      });
    });
  });

  function runTest(level, expectErroneous, message) {
    return appControls.trigger(level).then(function() {
      return utils.retry(function() {
        return agentControls.getSpans().then(function(spans) {
          var entrySpan = utils.expectOneMatching(spans, function(span) {
            expect(span.n).to.equal('node.http.server');
            expect(span.f.e).to.equal(String(appControls.getPid()));
          });
          utils.expectOneMatching(spans, function(span) {
            checkBunyanSpan(span, entrySpan, expectErroneous, message);
          });
          utils.expectOneMatching(spans, function(span) {
            checkNextExitSpan(span, entrySpan);
          });

          // verify that nothing logged by Instana has been traced
          var allBunyanSpans = utils.getSpansByName(spans, 'log.bunyan');
          expect(allBunyanSpans.length).to.equal(1);
        });
      });
    });
  }

  function checkBunyanSpan(span, parent, erroneous, message) {
    expect(span.t).to.equal(parent.t);
    expect(span.p).to.equal(parent.s);
    expect(span.k).to.equal(2);
    expect(span.f.e).to.equal(String(appControls.getPid()));
    expect(span.n).to.equal('log.bunyan');
    expect(span.async).to.equal(false);
    expect(span.error).to.equal(erroneous);
    expect(span.ec).to.equal(erroneous ? 1 : 0);
    expect(span.data).to.exist;
    expect(span.data.log).to.exist;
    expect(span.data.log.message).to.equal(message);
  }

  function checkNextExitSpan(span, parent) {
    expect(span.t).to.equal(parent.t);
    expect(span.p).to.equal(parent.s);
    expect(span.k).to.equal(2);
    expect(span.f.e).to.equal(String(appControls.getPid()));
    expect(span.n).to.equal('node.http.client');
  }

  function verifyInstanaLoggingIsNotTraced() {
    return appControls.trigger('trigger').then(function() {
      return utils.retry(function() {
        return agentControls.getSpans().then(function(spans) {
          utils.expectOneMatching(spans, function(span) {
            expect(span.n).to.equal('node.http.server');
            expect(span.f.e).to.equal(String(appControls.getPid()));
          });

          // verify that nothing logged by Instana has been traced
          var allBunyanSpans = utils.getSpansByName(spans, 'log.bunyan');
          expect(allBunyanSpans).to.be.empty;
        });
      });
    });
  }
});
