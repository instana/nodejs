'use strict';

var expect = require('chai').expect;

var supportedVersion = require('../../../../src/tracing/index').supportedVersion;
var config = require('../../../config');
var utils = require('../../../utils');

describe('tracing/logger/pino', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  this.timeout(config.getTestTimeout());
  var agentControls = require('../../../apps/agentStubControls');
  var appControls = require('./controls');
  agentControls.registerTestHooks();
  appControls.registerTestHooks();

  beforeEach(function() {
    return agentControls.waitUntilAppIsCompletelyInitialized(appControls.getPid());
  });

  runTests(false);
  runTests(true);

  function runTests(useExpressPino) {
    var suffix = useExpressPino ? ' (express-pino)' : '';

    it('must not trace info' + suffix, function() {
      return appControls.trigger('info', useExpressPino).then(function() {
        return utils.retry(function() {
          return agentControls.getSpans().then(function(spans) {
            var entrySpan = utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.server');
              expect(span.f.e).to.equal(String(appControls.getPid()));
            });
            utils.expectOneMatching(spans, function(span) {
              checkNextExitSpan(span, entrySpan);
            });
            var pinoSpans = utils.getSpansByName(spans, 'log.pino');
            expect(pinoSpans).to.be.empty;
          });
        });
      });
    });

    it('must trace warn' + suffix, function() {
      return runTest('warn', useExpressPino, false, 'Warn message - should be traced.');
    });

    it('must trace error' + suffix, function() {
      return runTest('error', useExpressPino, true, 'Error message - should be traced.');
    });

    it('must trace fatal' + suffix, function() {
      return runTest('fatal', useExpressPino, true, 'Fatal message - should be traced.');
    });

    it('must trace error object' + suffix, function() {
      return runTest(
        'error-object-only',
        useExpressPino,
        true,
        'Log call without message. ' +
          'The Pino mergingObject argument will not be serialized by Instana for performance reasons.'
      );
    });

    it('must trace error object and string' + suffix, function() {
      return runTest('error-object-and-string', useExpressPino, true, 'Error message - should be traced.');
    });

    it('must not trace custom info' + suffix, function() {
      return appControls.trigger('custom-info', useExpressPino).then(function() {
        return utils.retry(function() {
          return agentControls.getSpans().then(function(spans) {
            var entrySpan = utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.server');
              expect(span.f.e).to.equal(String(appControls.getPid()));
            });
            utils.expectOneMatching(spans, function(span) {
              checkNextExitSpan(span, entrySpan);
            });
            var pinoSpans = utils.getSpansByName(spans, 'log.pino');
            expect(pinoSpans).to.be.empty;
          });
        });
      });
    });

    it('must trace custom error' + suffix, function() {
      return runTest('custom-error', useExpressPino, true, 'Custom error level message - should be traced.');
    });

    it('must trace child logger error' + suffix, function() {
      if (useExpressPino) {
        return;
      }
      return runTest('child-error', false, true, 'Child logger error message - should be traced.');
    });
  }

  function runTest(level, useExpressPino, expectErroneous, message) {
    return appControls.trigger(level, useExpressPino).then(function() {
      return utils.retry(function() {
        return agentControls.getSpans().then(function(spans) {
          var entrySpan = utils.expectOneMatching(spans, function(span) {
            expect(span.n).to.equal('node.http.server');
            expect(span.f.e).to.equal(String(appControls.getPid()));
          });
          utils.expectOneMatching(spans, function(span) {
            checkPinoSpan(span, entrySpan, useExpressPino, expectErroneous, message);
          });
          utils.expectOneMatching(spans, function(span) {
            checkNextExitSpan(span, entrySpan);
          });
        });
      });
    });
  }

  function checkPinoSpan(span, parent, useExpressPino, erroneous, message) {
    expect(span.t).to.equal(parent.t);
    expect(span.p).to.equal(parent.s);
    expect(span.k).to.equal(2);
    expect(span.f.e).to.equal(String(appControls.getPid()));
    expect(span.n).to.equal('log.pino');
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
});
