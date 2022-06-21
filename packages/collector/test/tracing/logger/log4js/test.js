/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const { expect } = require('chai');

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const testUtils = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('tracing/logger/log4js', function () {
  this.timeout(config.getTestTimeout());

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  const controls = new ProcessControls({
    dirname: __dirname,
    useGlobalAgent: true
  });
  ProcessControls.setUpHooks(controls);

  [false, true].forEach(useLogMethod => runTests(useLogMethod));

  function runTests(useLogMethod) {
    let suffix = '';
    if (useLogMethod) {
      suffix = '(using log method)';
    } else {
      suffix = '(using level method)';
    }

    it(`must not trace info ${suffix}`, () =>
      trigger('info', 'Info message - must not be traced.', useLogMethod).then(() =>
        testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const entrySpan = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.f.e).to.equal(String(controls.getPid())),
              span => expect(span.f.h).to.equal('agent-stub-uuid')
            ]);
            testUtils.expectAtLeastOneMatching(spans, span => {
              checkNextExitSpan(span, entrySpan);
            });
            const log4jsSpans = testUtils.getSpansByName(spans, 'log.log4js');
            expect(log4jsSpans).to.be.empty;
          })
        )
      ));

    it('[suppressed] should not trace', async function () {
      await controls.sendRequest({
        method: 'POST',
        path: '/log?level=error',
        suppressTracing: true
      });

      return testUtils
        .retry(() => testUtils.delay(config.getTestTimeout() / 4))
        .then(() => agentControls.getSpans())
        .then(spans => {
          if (spans.length > 0) {
            expect.fail(`Unexpected spans ${testUtils.stringifyItems(spans)}.`);
          }
        });
    });

    it(`must trace warn ${suffix}`, () => runTest('warn', 'Warn message - should be traced.', useLogMethod, false));

    it(`must trace error ${suffix}`, () => runTest('error', 'Error message - should be traced.', useLogMethod, true));

    it(`must trace fatal ${suffix}`, () => runTest('fatal', 'Fatal message - should be traced.', useLogMethod, true));
  }

  function runTest(level, message, useLogMethod, expectErroneous) {
    return trigger(level, message, useLogMethod).then(() =>
      testUtils.retry(() =>
        agentControls.getSpans().then(spans => {
          const entrySpan = testUtils.expectAtLeastOneMatching(spans, [
            span => expect(span.n).to.equal('node.http.server'),
            span => expect(span.f.e).to.equal(String(controls.getPid())),
            span => expect(span.f.h).to.equal('agent-stub-uuid')
          ]);
          testUtils.expectAtLeastOneMatching(spans, span => {
            checkLog4jsSpan(span, entrySpan, expectErroneous, message);
          });
          testUtils.expectAtLeastOneMatching(spans, span => {
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
