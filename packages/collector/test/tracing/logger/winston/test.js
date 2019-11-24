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
  agentControls.registerTestHooks();
  const Controls = require('./controls');
  const controls = new Controls({ agentControls });
  controls.registerTestHooks();

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
      testName += 'log/' + level;
      query.useLevelMethod = false;
    }
    if (shouldTrace) {
      testName += ' must trace (';
    } else {
      testName += ' must not trace (';
    }
    testName += variant + ')';

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
          utils.retry(() =>
            agentControls.getSpans().then(spans => {
              const entrySpan = utils.expectOneMatching(spans, span => {
                expect(span.n).to.equal('node.http.server');
                expect(span.f.e).to.equal(String(controls.getPid()));
                expect(span.f.h).to.equal('agent-stub-uuid');
              });
              if (shouldTrace) {
                utils.expectOneMatching(spans, span => {
                  checkWinstonSpan(span, entrySpan, expectErroneous, expectedMessage);
                });
              } else {
                const winstonSpans = utils.getSpansByName(spans, 'log.winston');
                expect(winstonSpans).to.be.empty;
              }
              utils.expectOneMatching(spans, span => {
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
    expect(span.f.e).to.equal(String(controls.getPid()));
    expect(span.f.h).to.equal('agent-stub-uuid');
    expect(span.n).to.equal('node.http.client');
  }
});
