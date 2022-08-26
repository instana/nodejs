/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const { expect } = require('chai');

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const {
  delay,
  expectAtLeastOneMatching,
  getSpansByName,
  retry,
  stringifyItems
} = require('../../../../../core/test/test_util');
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

    it(`must not trace info ${suffix}`, async () => {
      await trigger({ level: 'info', message: 'Info message - must not be traced.', useLogMethod });
      return retry(async () => {
        const spans = await agentControls.getSpans();
        const entrySpan = expectAtLeastOneMatching(spans, [
          span => expect(span.n).to.equal('node.http.server'),
          span => expect(span.f.e).to.equal(String(controls.getPid())),
          span => expect(span.f.h).to.equal('agent-stub-uuid')
        ]);
        expectAtLeastOneMatching(spans, span => {
          checkNextExitSpan(span, entrySpan);
        });
        const log4jsSpans = getSpansByName(spans, 'log.log4js');
        expect(log4jsSpans).to.be.empty;
      });
    });

    it('[suppressed] should not trace', async function () {
      await controls.sendRequest({
        method: 'POST',
        path: '/log?level=error',
        suppressTracing: true
      });

      await delay(config.getTestTimeout() / 4);
      const spans = await agentControls.getSpans();
      if (spans.length > 0) {
        expect.fail(`Unexpected spans ${stringifyItems(spans)}.`);
      }
    });

    it(`must trace warn ${suffix}`, () =>
      runTest({
        level: 'warn',
        message: 'Warn message - should be traced.',
        useLogMethod
      }));

    it(`must trace error ${suffix}`, () =>
      runTest({
        level: 'error',
        message: 'Error message - should be traced.',
        useLogMethod,
        expectErroneous: true
      }));

    it(`must trace fatal ${suffix}`, () =>
      runTest({
        level: 'fatal',
        message: 'Fatal message - should be traced.',
        useLogMethod,
        expectErroneous: true
      }));

    it(`must trace error ${suffix} with multiple log arguments`, () =>
      runTest({
        level: 'error',
        message: 'Error message - should be traced.',
        useLogMethod,
        expectErroneous: true,
        multipleArguments: true
      }));
  }

  async function runTest({ level, message, useLogMethod, expectErroneous = false, multipleArguments = false }) {
    await trigger({ level, message, useLogMethod, multipleArguments });
    await retry(async () => {
      const spans = await agentControls.getSpans();
      const entrySpan = expectAtLeastOneMatching(spans, [
        span => expect(span.n).to.equal('node.http.server'),
        span => expect(span.f.e).to.equal(String(controls.getPid())),
        span => expect(span.f.h).to.equal('agent-stub-uuid')
      ]);
      expectAtLeastOneMatching(spans, span => {
        checkLog4jsSpan(span, entrySpan, expectErroneous, message, multipleArguments);
      });
      expectAtLeastOneMatching(spans, span => {
        checkNextExitSpan(span, entrySpan);
      });
    });
  }

  function checkLog4jsSpan(span, parent, expectErroneous, message, multipleArguments) {
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
    if (multipleArguments) {
      expect(span.data.log.message).to.equal(`${message} more arguments`);
    } else {
      expect(span.data.log.message).to.equal(message);
    }
  }

  function checkNextExitSpan(span, parent) {
    expect(span.t).to.equal(parent.t);
    expect(span.p).to.equal(parent.s);
    expect(span.k).to.equal(constants.EXIT);
    expect(span.f.e).to.equal(String(controls.getPid()));
    expect(span.f.h).to.equal('agent-stub-uuid');
    expect(span.n).to.equal('node.http.client');
  }

  function trigger({ level, message, useLogMethod, multipleArguments = false }) {
    const query = {
      level,
      message,
      useLogMethod,
      multipleArguments
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
