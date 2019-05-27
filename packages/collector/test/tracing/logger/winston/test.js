'use strict';

const semver = require('semver');
const expect = require('chai').expect;

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../config');
const utils = require('../../../utils');

describe('tracing/logger/winston', function() {
  // Winston 3 has no guaranteed support for Node.js 4, code will be migrated to ES6 over time
  // (see https://github.com/winstonjs/winston/blob/master/CHANGELOG.md#v300-rc0--2017-10-02)
  if (!supportedVersion(process.versions.node) || semver.lt(process.versions.node, '6.0.0')) {
    return;
  }

  this.timeout(config.getTestTimeout());
  const agentControls = require('../../../apps/agentStubControls');
  const appControls = require('./controls');
  agentControls.registerTestHooks();
  appControls.registerTestHooks();

  beforeEach(() => agentControls.waitUntilAppIsCompletelyInitialized(appControls.getPid()));

  runTests(false, false);
  runTests(true, false);
  runTests(false, true);
  runTests(true, true);

  function runTests(useGlobalLogger, useLogFunction) {
    let suffix = '';
    if (useGlobalLogger && useLogFunction) {
      suffix = ' (global/log)';
    } else if (useGlobalLogger) {
      suffix = ' (global)';
    } else if (useLogFunction) {
      suffix = ' (log)';
    }

    it(`must not trace info${suffix}`, () =>
      appControls.trigger('info', useGlobalLogger, useLogFunction).then(() =>
        utils.retry(() =>
          agentControls.getSpans().then(spans => {
            const entrySpan = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.f.e).to.equal(String(appControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
            });
            utils.expectOneMatching(spans, span => {
              checkNextExitSpan(span, entrySpan);
            });
            const winstonSpans = utils.getSpansByName(spans, 'log.winston');
            expect(winstonSpans).to.be.empty;
          })
        )
      ));

    it(`must trace warn${suffix}`, () =>
      runTest('warn', useGlobalLogger, useLogFunction, false, 'Warn message - should be traced.'));

    it(`must trace error${suffix}`, () =>
      runTest('error', useGlobalLogger, useLogFunction, true, 'Error message - should be traced.'));
  }

  function runTest(level, useGlobalLogger, useLogFunction, expectErroneous, message) {
    return appControls.trigger(level, useGlobalLogger, useLogFunction).then(() =>
      utils.retry(() =>
        agentControls.getSpans().then(spans => {
          const entrySpan = utils.expectOneMatching(spans, span => {
            expect(span.n).to.equal('node.http.server');
            expect(span.f.e).to.equal(String(appControls.getPid()));
            expect(span.f.h).to.equal('agent-stub-uuid');
          });
          utils.expectOneMatching(spans, span => {
            checkWinstonSpan(span, entrySpan, expectErroneous, message);
          });
          utils.expectOneMatching(spans, span => {
            checkNextExitSpan(span, entrySpan);
          });
        })
      )
    );
  }

  function checkWinstonSpan(span, parent, erroneous, message) {
    expect(span.t).to.equal(parent.t);
    expect(span.p).to.equal(parent.s);
    expect(span.k).to.equal(constants.EXIT);
    expect(span.f.e).to.equal(String(appControls.getPid()));
    expect(span.f.h).to.equal('agent-stub-uuid');
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
    expect(span.k).to.equal(constants.EXIT);
    expect(span.f.e).to.equal(String(appControls.getPid()));
    expect(span.f.h).to.equal('agent-stub-uuid');
    expect(span.n).to.equal('node.http.client');
  }
});
