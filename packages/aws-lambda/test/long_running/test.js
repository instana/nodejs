/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const { inspect } = require('util');
const { expect } = require('chai');
const path = require('path');
const constants = require('@_local/core').tracing.constants;

const Control = require('../Control');
const expectExactlyOneMatching = require('@_local/core/test/test_util/expectExactlyOneMatching');
const config = require('@_local/core/test/config');
const { isCI } = require('@_local/core/test/test_util');

const functionName = 'functionName';
const unqualifiedArn = `arn:aws:lambda:us-east-2:767398002385:function:${functionName}`;
const version = '$LATEST';
const qualifiedArn = `${unqualifiedArn}:${version}`;

const instanaAgentKey = 'aws-lambda-dummy-key';
let timeout;

function prelude(opts) {
  // The lambda under test creates an SDK span every ${opts.delay} milliseconds.
  opts.delay = opts.delay || 1000;
  // The lambda under test does this ${opts.iterations} times, then terminates.
  opts.iterations = opts.iterations || 10;
  opts.expectedLambdaRuntime = opts.delay * opts.iterations + 1500;

  timeout = Math.max(opts.expectedLambdaRuntime * 2, config.getTestTimeout());

  this.timeout(timeout);
  this.slow(timeout * 0.8);

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

describe('long running lambdas', () => {
  const handlerDefinitionPath = path.join(__dirname, './lambda');

  describe('when the back end is responsive', function () {
    const opts = {
      handlerDefinitionPath,
      instanaAgentKey,
      delay: 1000,
      iterations: 3
    };

    const env = prelude.bind(this)(opts);
    let control;

    before(async () => {
      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath: handlerDefinitionPath,
        startBackend: true,
        longHandlerRun: true,
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

    it('must capture metrics and spans', () => {
      return control.runHandler().then(() => {
        const duration = Date.now() - control.startedAt;
        verifyResponse(control);

        if (!isCI()) {
          expect(duration).to.be.at.most(opts.expectedLambdaRuntime);
        }

        return Promise.all([
          //
          control.getSpans(),
          control.getMetrics(),
          control.getRawBundles(),
          control.getRawSpanArrays()
        ]).then(([spans, metrics, rawBundles, rawSpanArrays]) => {
          verifySpans(spans, opts);
          verifyMetrics(metrics);

          // The lambda runs x seconds and creates a span every second.
          // We send all these spans in the the final bundle.
          expect(rawSpanArrays).to.be.an('array');
          expect(rawSpanArrays).to.have.lengthOf(0);
          expect(rawBundles).to.be.an('array');
          expect(rawBundles).to.have.lengthOf(1);
          expect(rawBundles[0].spans).to.have.lengthOf(opts.iterations + 1);
        });
      });
    });
  });

  describe('when the back end is down', function () {
    const opts = {
      handlerDefinitionPath,
      instanaAgentKey,
      // Run for 70 seconds, create a span every 250 ms.
      delay: 250,
      iterations: 10
    };
    const env = prelude.bind(this)(opts);
    let control;

    before(async () => {
      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath: handlerDefinitionPath,
        startBackend: false,
        longHandlerRun: true,
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

    it('must ignore the failed requests gracefully', () => {
      return control.runHandler().then(() => {
        const duration = Date.now() - control.startedAt;
        verifyResponse(control);

        if (!isCI()) {
          expect(duration).to.be.at.most(opts.expectedLambdaRuntime);
        }
      });
    });
  });

  describe('when the back end is reachable but does not respond', function () {
    const opts = {
      handlerDefinitionPath,
      instanaAgentKey,
      delay: 100,
      iterations: 10
    };
    const env = prelude.bind(this)(opts);
    let control;

    before(async () => {
      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath: handlerDefinitionPath,
        startBackend: 'unresponsive',
        longHandlerRun: true,
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

    it('must stop trying after first timed out request', () => {
      return control.runHandler().then(() => {
        const duration = Date.now() - control.startedAt;
        verifyResponse(control);

        if (!isCI()) {
          expect(duration).to.be.at.most(opts.expectedLambdaRuntime);
        }

        return Promise.all([
          //
          control.getSpans(),
          control.getMetrics(),
          control.getRawBundles(),
          control.getRawSpanArrays(),
          control.getRawMetrics()
        ]).then(([spans, metrics, rawBundles, rawSpanArrays, rawMetrics]) => {
          expect(spans).to.have.lengthOf(0);
          expect(metrics).to.have.lengthOf(0);
          expect(rawSpanArrays).to.have.lengthOf(0);
          expect(rawBundles).to.have.lengthOf(1);
          expect(rawBundles[0].spans).to.have.lengthOf(opts.iterations + 1);
          expect(rawMetrics).to.have.lengthOf(0);
        });
      });
    });
  });

  function verifyResponse(control) {
    /* eslint-disable no-console */
    if (control.getLambdaErrors() && control.getLambdaErrors().length > 0) {
      console.log('Unexpected Errors:');
      console.log(JSON.stringify(control.getLambdaErrors()));
    }
    expect(control.getLambdaErrors()).to.be.empty;
    expect(control.getLambdaResults().length).to.equal(1);
    const result = control.getLambdaResults()[0];
    expect(result).to.exist;
    const body = result.body;
    expect(body.message).to.equal('Stan says hi!');
  }

  function verifySpans(spans, opts) {
    verifyLambdaEntry(spans);
    verifyNoHttpExits(spans);
    verifySdkExits(spans, opts);
  }

  function verifyLambdaEntry(spans) {
    return expectExactlyOneMatching(spans, [
      span => expect(span.t).to.exist,
      span => expect(span.p).to.not.exist,
      span => expect(span.s).to.exist,
      span => expect(span.n).to.equal('aws.lambda.entry'),
      span => expect(span.k).to.equal(constants.ENTRY),
      span => expect(span.f).to.be.an('object'),
      span => expect(span.f.h).to.not.exist,
      span => expect(span.f.hl).to.be.true,
      span => expect(span.f.cp).to.equal('aws'),
      span => expect(span.f.e).to.equal(qualifiedArn),
      span => expect(span.async).to.not.exist,
      span => expect(span.data.lambda).to.be.an('object'),
      span => expect(span.data.lambda.runtime).to.equal('nodejs'),
      span => expect(span.data.lambda.error).to.not.exist,
      span => expect(span.error).to.not.exist,
      span => expect(span.ec).to.equal(0)
    ]);
  }
  /**
   * Verify that our http requests to the back end (for offloading bundles, spans, metrics) are not
   * accidentally traced, that is, we use an uninstrumented copy of the https module for those requests.
   */
  function verifyNoHttpExits(spans) {
    /* eslint-disable no-console */
    const httpExits = spans.filter(span => span.n === 'node.http.client');
    if (httpExits.length > 0) {
      console.log('Unexpected node.http.client spans:');
      console.log(inspect(httpExits, { depth: null }));
    }
    expect(httpExits).to.have.lengthOf(0);
  }

  function verifySdkExits(spans, opts) {
    const sdkExits = spans.filter(
      span =>
        span.n === 'sdk' && //
        span.k === 2 &&
        span.data.sdk.name === 'custom-span' &&
        span.data.sdk.type === 'exit'
    );
    expect(sdkExits).to.have.lengthOf(opts.iterations);
  }

  function verifyMetrics(allMetrics) {
    expect(allMetrics).to.exist;
    expect(Array.isArray(allMetrics)).to.be.true;
    expect(allMetrics).to.have.lengthOf(1);
    const allPlugins = allMetrics[0];
    expect(allPlugins.plugins).to.have.lengthOf(1);
    const pluginData = allPlugins.plugins[0];
    expect(pluginData.data).to.exist;
    expect(pluginData.name).to.equal('com.instana.plugin.aws.lambda');
    expect(pluginData.entityId).to.equal(qualifiedArn);
    const metrics = pluginData.data;
    expect(metrics.sensorVersion).to.match(/^\d+\.\d+.\d+(?:-rc\.\d+)?$/);
    expect(metrics.startTime).to.be.at.most(Date.now());
    expect(metrics.versions).to.be.an('object');
    expect(metrics.versions.node).to.be.a('string');
    expect(metrics.versions.v8).to.be.a('string');
    expect(metrics.versions.uv).to.be.a('string');
    expect(metrics.versions.zlib).to.be.a('string');
  }
});
