/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const { expect, fail } = require('chai');

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const testUtils = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('tracing/logger/winston', function () {
  this.timeout(config.getTestTimeout());

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  let controls;

  before(async () => {
    controls = new ProcessControls({
      dirname: __dirname,
      useGlobalAgent: true
    });

    await controls.startAndWaitForAgentConnection();
  });

  beforeEach(async () => {
    await agentControls.clearReceivedTraceData();
  });

  after(async () => {
    await controls.stop();
  });

  afterEach(async () => {
    await controls.clearIpcMessages();
  });

  [false, true].forEach(useGlobalLogger =>
    [false, true].forEach(useLevelMethod =>
      [
        'string-only',
        'string-plus-additional-message',
        // 'string-substitution',
        'object-with-message',
        'object-with-level'
      ]
        .filter(variant => variant !== 'object-with-level' || !useLevelMethod)
        .forEach(variant =>
          ['info', 'warn', 'error'].forEach(level => {
            runTests(useGlobalLogger, useLevelMethod, variant, level);

            it(`[suppressed] should not trace: ${level}`, async function () {
              await controls.sendRequest({
                method: 'GET',
                path: `/log?level=${level}&variant=string-only`,
                suppressTracing: true
              });

              return testUtils
                .retry(() => testUtils.delay(1000))
                .then(() => agentControls.getSpans())
                .then(spans => {
                  if (spans.length > 0) {
                    expect.fail(`Unexpected spans ${testUtils.stringifyItems(spans)}.`);
                  }
                });
            });
          })
        )
    )
  );
  // runTests(false, true, 'string-only', 'warn');

  function runTests(useGlobalLogger, useLevelMethod, variant, level) {
    let testName;
    const shouldTrace = level !== 'info';
    const expectErroneous = level === 'error';
    const query = {
      variant,
      level
    };
    if (useGlobalLogger) {
      testName = 'winston.';
      query.useGlobalLogger = true;
    } else {
      testName = 'logger.';
      query.useGlobalLogger = false;
    }
    if (useLevelMethod) {
      testName += level;
      query.useLevelMethod = true;
    } else {
      testName += `log/${level}`;
      query.useLevelMethod = false;
    }
    if (shouldTrace) {
      testName += ' must trace (';
    } else {
      testName += ' must not trace (';
    }
    testName += `${variant})`;

    const queryString = Object.keys(query)
      .map(key => `${key}=${query[key]}`)
      .join('&');

    let expectedMessage;
    if (variant === 'string-plus-additional-message') {
      expectedMessage = 'the message+additional message';
    } else if (variant === 'string-substitution') {
      expectedMessage = 'the message replacement';
    } else {
      expectedMessage = 'the message';
    }

    it(testName, () =>
      controls
        .sendRequest({
          path: `/log?${queryString}`
        })
        .then(() =>
          testUtils.retry(() =>
            agentControls.getSpans().then(spans => {
              const entrySpan = testUtils.expectAtLeastOneMatching(spans, [
                span => expect(span.n).to.equal('node.http.server'),
                span => expect(span.f.e).to.equal(String(controls.getPid())),
                span => expect(span.f.h).to.equal('agent-stub-uuid')
              ]);
              if (shouldTrace) {
                testUtils.expectAtLeastOneMatching(spans, span => {
                  checkWinstonSpan(span, entrySpan, expectErroneous, expectedMessage);
                });

                // entry + exit + winston log
                // NOTE: winston uses process.stdout (console._stdout) directly
                //       The check just ensures that our console.* instrumentation isn't used when customer uses winston
                expect(spans.length).to.eql(3);
              } else {
                const winstonSpans = testUtils.getSpansByName(spans, 'log.winston');
                expect(winstonSpans).to.be.empty;
              }
              testUtils.expectAtLeastOneMatching(spans, span => {
                checkNextExitSpan(span, entrySpan);
              });
            })
          )
        )
    );
  }

  function checkWinstonSpan(span, parent, erroneous, message) {
    expect(span.t).to.equal(parent.t);
    expect(span.p).to.equal(parent.s);
    expect(span.k).to.equal(constants.EXIT);
    expect(span.f.e).to.equal(String(controls.getPid()));
    expect(span.f.h).to.equal('agent-stub-uuid');
    expect(span.n).to.equal('log.winston');
    expect(span.async).to.not.exist;
    expect(span.error).to.not.exist;
    expect(span.ec).to.equal(erroneous ? 1 : 0);
    expect(span.data).to.exist;
    expect(span.data.log).to.exist;
    expect(span.data.log.message).to.equal(message);
    verifyStackTrace(span);
  }

  function verifyStackTrace(span) {
    expect(span.stack).to.be.an('array');
    expect(span.stack).to.not.be.empty;
    let found = false;
    span.stack.forEach(callSite => {
      found = found || callSite.c.indexOf('winston/app.') >= 0;
    });
    if (!found) {
      fail(`Did not find the expected call site winston/app.js in ${JSON.stringify(span.stack, null, 2)}`);
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
});
