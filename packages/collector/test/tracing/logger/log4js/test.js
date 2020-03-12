'use strict';

const { expect } = require('chai');

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const utils = require('../../../../../core/test/utils');
const ProcessControls = require('../../ProcessControls');

describe('tracing/logger/log4js', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  this.timeout(config.getTestTimeout());
  const agentControls = require('../../../apps/agentStubControls');
  agentControls.registerTestHooks();
  const controls = new ProcessControls({
    dirname: __dirname,
    agentControls
  }).registerTestHooks();

  [false, true].forEach(useLogMethod => runTests(useLogMethod));
  // runTests(true);

  function runTests(useLogMethod) {
    let suffix = '';
    if (useLogMethod) {
      suffix = '(using log method)';
    } else {
      suffix = '(using level method)';
    }

    it(`must not trace info ${suffix}`, () =>
      trigger('info', 'Info message - must not be traced.', useLogMethod).then(() =>
        utils.retry(() =>
          agentControls.getSpans().then(spans => {
            const entrySpan = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.f.e).to.equal(String(controls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
            });
            utils.expectOneMatching(spans, span => {
              checkNextExitSpan(span, entrySpan);
            });
            const log4jsSpans = utils.getSpansByName(spans, 'log.log4js');
            expect(log4jsSpans).to.be.empty;
          })
        )
      ));

    it(`must trace warn ${suffix}`, () => runTest('warn', 'Warn message - should be traced.', useLogMethod, false));

    it(`must trace error ${suffix}`, () => runTest('error', 'Error message - should be traced.', useLogMethod, true));

    it(`must trace fatal ${suffix}`, () => runTest('fatal', 'Fatal message - should be traced.', useLogMethod, true));
  }

  function runTest(level, message, useLogMethod, expectErroneous) {
    return trigger(level, message, useLogMethod).then(() =>
      utils.retry(() =>
        agentControls.getSpans().then(spans => {
          const entrySpan = utils.expectOneMatching(spans, span => {
            expect(span.n).to.equal('node.http.server');
            expect(span.f.e).to.equal(String(controls.getPid()));
            expect(span.f.h).to.equal('agent-stub-uuid');
          });
          utils.expectOneMatching(spans, span => {
            checkLog4jsSpan(span, entrySpan, expectErroneous, message);
          });
          utils.expectOneMatching(spans, span => {
            checkNextExitSpan(span, entrySpan);
          });
        })
      )
    );
  }

  function checkLog4jsSpan(span, parent, expectErroneous, message) {
    expect(span.t).to.equal(parent.t);
    expect(span.p).to.equal(parent.s);
    expect(span.k).to.equal(constants.EXIT);
    expect(span.f.e).to.equal(String(controls.getPid()));
    expect(span.f.h).to.equal('agent-stub-uuid');
    expect(span.n).to.equal('log.log4js');
    expect(span.async).to.not.exist;
    expect(span.error).to.not.exist;
    expect(span.ec).to.equal(expectErroneous ? 1 : 0);
    expect(span.data).to.exist;
    expect(span.data.log).to.exist;
    expect(span.data.log.message).to.equal(message);
  }

  function checkNextExitSpan(span, parent) {
    expect(span.t).to.equal(parent.t);
    expect(span.p).to.equal(parent.s);
    expect(span.k).to.equal(constants.EXIT);
    expect(span.f.e).to.equal(String(controls.getPid()));
    expect(span.f.h).to.equal('agent-stub-uuid');
    expect(span.n).to.equal('node.http.client');
  }

  function trigger(level, message, useLogMethod) {
    const query = {
      level,
      message,
      useLogMethod
    };
    const queryString = Object.keys(query)
      .map(key => `${key}=${query[key]}`)
      .join('&');

    return controls.sendRequest({
      method: 'POST',
      path: `/log?${queryString}`,
      simple: false
    });
  }
});
