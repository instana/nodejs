'use strict';

var semver = require('semver');
var expect = require('chai').expect;

var supportedVersion = require('../../../../src/tracing/index').supportedVersion;
var config = require('../../../config');
var utils = require('../../../utils');

describe('tracing/logger/winston', function() {
  // Winston 3 has no guaranteed support for Node.js 4, code will be migrated to ES6 over time
  // (see https://github.com/winstonjs/winston/blob/master/CHANGELOG.md#v300-rc0--2017-10-02)
  if (!supportedVersion(process.versions.node) || semver.lt(process.versions.node, '6.0.0')) {
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

  runTests(false, false);
  runTests(true, false);
  runTests(false, true);
  runTests(true, true);

  function runTests(useGlobalLogger, useLogFunction) {
    var suffix = '';
    if (useGlobalLogger && useLogFunction) {
      suffix = ' (global/log)';
    } else if (useGlobalLogger) {
      suffix = ' (global)';
    } else if (useLogFunction) {
      suffix = ' (log)';
    }

    it('must not trace info' + suffix, function() {
      return appControls.trigger('info', useGlobalLogger, useLogFunction).then(function() {
        return utils.retry(function() {
          return agentControls.getSpans().then(function(spans) {
            var entrySpan = utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.server');
              expect(span.f.e).to.equal(String(appControls.getPid()));
            });
            utils.expectOneMatching(spans, function(span) {
              checkNextExitSpan(span, entrySpan);
            });
            var winstonSpans = utils.getSpansByName(spans, 'log.winston');
            expect(winstonSpans).to.be.empty;
          });
        });
      });
    });

    it('must trace warn' + suffix, function() {
      return runTest('warn', useGlobalLogger, useLogFunction, false, 'Warn message - should be traced.');
    });

    it('must trace error' + suffix, function() {
      return runTest('error', useGlobalLogger, useLogFunction, true, 'Error message - should be traced.');
    });
  }

  function runTest(level, useGlobalLogger, useLogFunction, expectErroneous, message) {
    return appControls.trigger(level, useGlobalLogger, useLogFunction).then(function() {
      return utils.retry(function() {
        return agentControls.getSpans().then(function(spans) {
          var entrySpan = utils.expectOneMatching(spans, function(span) {
            expect(span.n).to.equal('node.http.server');
            expect(span.f.e).to.equal(String(appControls.getPid()));
          });
          utils.expectOneMatching(spans, function(span) {
            checkWinstonSpan(span, entrySpan, expectErroneous, message);
          });
          utils.expectOneMatching(spans, function(span) {
            checkNextExitSpan(span, entrySpan);
          });
        });
      });
    });
  }

  function checkWinstonSpan(span, parent, erroneous, message) {
    expect(span.t).to.equal(parent.t);
    expect(span.p).to.equal(parent.s);
    expect(span.k).to.equal(2);
    expect(span.f.e).to.equal(String(appControls.getPid()));
    expect(span.n).to.equal('log.winston');
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
