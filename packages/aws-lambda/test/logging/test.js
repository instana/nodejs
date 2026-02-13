/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const { expect } = require('chai');
const path = require('path');
const Control = require('../Control');
const config = require('@_local/core/test/config');
const instanaAgentKey = 'aws-lambda-dummy-key';
const timeout = 1000 * 5;

function prelude(opts) {
  // The lambda under test creates an SDK span every ${opts.delay} milliseconds.
  opts.delay = opts.delay || 1000;
  // The lambda under test does this ${opts.iterations} times, then terminates.
  opts.iterations = opts.iterations || 10;
  opts.expectedLambdaRuntime = opts.delay * opts.iterations * 1.1;

  const env = {
    DELAY: opts.delay,
    ITERATIONS: opts.iterations,
    LAMBDA_TIMEOUT: 300000
  };
  if (opts.instanaAgentKey) {
    env.INSTANA_AGENT_KEY = opts.instanaAgentKey;
  }
  if (opts.withConfig) {
    env.WITH_CONFIG = 'true';
  }

  return env;
}

// NOTE: This test will fail if you initialise core before serverless.
//       e.g. aws-lambda/src/index -> require core and call init
describe('Logging', function () {
  this.timeout(config.getTestTimeout());

  const handlerDefinitionPath = path.join(__dirname, './lambda');

  const opts = {
    handlerDefinitionPath,
    instanaAgentKey,
    delay: 1000,
    iterations: 13
  };

  const env = prelude.bind(this)(opts);

  let control;

  before(async () => {
    control = new Control({
      faasRuntimePath: path.join(__dirname, '../runtime_mock'),
      handlerDefinitionPath,
      startBackend: true,
      env,
      timeout
    });

    await control.start();
  });

  beforeEach(async () => {
    await control.reset();
    await control.resetBackendSpansAndMetrics();
  });

  after(async () => {
    await control.stop();
  });

  it('does not capture serverless console logger usages', async () => {
    await control.runHandler();
    const spans = await control.getSpans();

    expect(spans.length).to.eql(3);

    expect(spans[0].n).to.eql('log.console');
    expect(spans[0].data.log.message).to.eql('this is a warning');

    expect(spans[1].n).to.eql('log.console');
    expect(spans[1].data.log.message).to.eql('this is an error');

    expect(spans[2].n).to.eql('aws.lambda.entry');
  });
});
