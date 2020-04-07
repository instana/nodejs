'use strict';

const { inspect } = require('util');
const { expect } = require('chai');
const path = require('path');
const semver = require('semver');
const constants = require('@instana/core').tracing.constants;

const Control = require('../Control');
const config = require('../../../serverless/test/config');
const expectOneMatching = require('../../../serverless/test/util/expect_matching');

const functionName = 'functionName';
const unqualifiedArn = `arn:aws:lambda:us-east-2:410797082306:function:${functionName}`;
const version = '$LATEST';
const qualifiedArn = `${unqualifiedArn}:${version}`;

const backendPort = 8443;
const backendBaseUrl = `https://localhost:${backendPort}/serverless`;
const downstreamDummyPort = 3456;
const downstreamDummyUrl = `http://localhost:${downstreamDummyPort}/`;
const instanaAgentKey = 'aws-lambda-dummy-key';

function prelude(opts) {
  // The lambda under test creates an SDK span every ${opts.delay} milliseconds.
  opts.delay = opts.delay || 1000;
  // The lambda under test does this ${opts.iterations} times, then terminates.
  opts.iterations = opts.iterations || 10;
  opts.expectedLambdaRuntime = opts.delay * opts.iterations * 1.1;
  const timeout = Math.max(opts.expectedLambdaRuntime * 2, config.getTestTimeout());
  this.timeout(timeout);
  this.slow(timeout * 0.8);

  if (opts.startBackend == null) {
    opts.startBackend = true;
  }

  const env = {
    DELAY: opts.delay,
    ITERATIONS: opts.iterations
  };
  if (opts.instanaEndpointUrl) {
    env.INSTANA_ENDPOINT_URL = opts.instanaEndpointUrl;
  }
  if (opts.instanaAgentKey) {
    env.INSTANA_AGENT_KEY = opts.instanaAgentKey;
  }
  if (opts.withConfig) {
    env.WITH_CONFIG = 'true';
  }

  const control = new Control({
    faasRuntimePath: path.join(__dirname, '../runtime_mock'),
    handlerDefinitionPath: opts.handlerDefinitionPath,
    startBackend: opts.startBackend,
    backendPort,
    backendBaseUrl,
    downstreamDummyUrl,
    env,
    timeout
  });
  control.registerTestHooks();
  return control;
}

describe('long running lambdas', () => {
  const handlerDefinitionPath = path.join(__dirname, './lambda');

  describe('when the back end is responsive', function() {
    const opts = {
      handlerDefinitionPath,
      instanaEndpointUrl: backendBaseUrl,
      instanaAgentKey,
      delay: 1000,
      iterations: 13
    };
    const control = prelude.bind(this)(opts);

    it('must capture metrics and spans', () =>
      control.runHandler().then(() => {
        const duration = Date.now() - control.startedAt;
        verifyResponse(control);
        expect(duration).to.be.at.most(opts.expectedLambdaRuntime);
        return Promise.all([
          //
          control.getSpans(),
          control.getMetrics(),
          control.getRawBundles(),
          control.getRawSpanArrays()
        ]).then(([spans, metrics, rawBundles, rawSpanArrays]) => {
          verifySpans(spans, opts);
          verifyMetrics(metrics);
          // The lambda runs 13 seconds and creates a span every second. We also send spans to serverless acceptor
          // every 5 seconds + the final bundle. Thus, we should see two intermittent POST requests to /traces and
          // one to /bundle.
          expect(rawSpanArrays).to.be.an('array');
          expect(rawSpanArrays).to.have.lengthOf(2);
          expect(rawBundles).to.be.an('array');
          expect(rawBundles).to.have.lengthOf(1);
        });
      }));
  });

  describe('when the back end is down', function() {
    const opts = {
      handlerDefinitionPath,
      instanaEndpointUrl: backendBaseUrl,
      instanaAgentKey,
      startBackend: false,
      // Run for 70 seconds, create a span every 250 ms.
      delay: 250,
      iterations: 280
    };
    const control = prelude.bind(this)(opts);

    it('must ignore the failed requests gracefully', () =>
      control.runHandler().then(() => {
        const duration = Date.now() - control.startedAt;
        verifyResponse(control);
        expect(duration).to.be.at.most(opts.expectedLambdaRuntime);
      }));
  });

  describe('when the back end is reachable but does not respond', function() {
    const opts = {
      handlerDefinitionPath,
      instanaEndpointUrl: backendBaseUrl,
      instanaAgentKey,
      startBackend: 'unresponsive',
      // run for 30 seconds, create a span every second
      delay: 1000,
      iterations: 30
    };
    const control = prelude.bind(this)(opts);

    it('must stop trying after first timed out request', () =>
      control.runHandler().then(() => {
        const duration = Date.now() - control.startedAt;
        verifyResponse(control);
        expect(duration).to.be.at.most(opts.expectedLambdaRuntime);
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

          // The first POST /spans (after 5 seconds) fails...
          expect(rawSpanArrays).to.have.lengthOf(1);
          // ...and we expect @instana/aws-lambda to stop sending spans after that. In particular, we expect the
          // POST /bundle at the end to not happen.
          expect(rawBundles).to.have.lengthOf(0);

          // @instana/aws-lambda never sends metrics while running, it only reports them at the end together with the
          // bundle.
          expect(rawMetrics).to.have.lengthOf(0);
        });
      }));
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
    return expectOneMatching(spans, span => {
      expect(span.t).to.exist;
      expect(span.p).to.not.exist;
      expect(span.s).to.exist;
      expect(span.n).to.equal('aws.lambda.entry');
      expect(span.k).to.equal(constants.ENTRY);
      expect(span.f).to.be.an('object');
      expect(span.f.h).to.not.exist;
      expect(span.f.hl).to.be.true;
      expect(span.f.cp).to.equal('aws');
      expect(span.f.e).to.equal(qualifiedArn);
      expect(span.async).to.not.exist;
      expect(span.data.lambda).to.be.an('object');
      expect(span.data.lambda.runtime).to.equal('nodejs');
      expect(span.data.lambda.error).to.not.exist;
      expect(span.error).to.not.exist;
      expect(span.ec).to.equal(0);
    });
  }
  /**
   * Verify that our http requests to the back end (for offloading bundles, spans, metrics) are not
   * accidentally traced, that is, we use an uninstrumented copy of the https module for those requests.
   */
  function verifyNoHttpExits(spans) {
    /* eslint-disable no-console */
    if (semver.lt(process.versions.node, '9.0.0')) {
      // In Node.js 8.x.x, the https module uses the http module internally. This means even if we use the
      // uninstrumented copy of the https module, we have no way of forcing it to use the uninstrumented copy of the
      // http module internally. Since the Node.js 8 runtime for AWS Lambda has been deprecated quite a while ago, this
      // is deemed acceptable. The only negative consequence of this shortcoming is that http requests to the Instana
      // back end might show up in Lambda traces when the Lambda uses Node.js 8.
      return;
    }
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
    expect(metrics.sensorVersion).to.match(/1\.\d\d+\.\d+/);
    expect(metrics.startTime).to.be.at.most(Date.now());
    expect(metrics.versions).to.be.an('object');
    expect(metrics.versions.node).to.match(/\d+\.\d+\.\d+/);
    expect(metrics.versions.v8).to.match(/\d+\.\d+\.\d+/);
    expect(metrics.versions.uv).to.match(/\d+\.\d+\.\d+/);
    expect(metrics.versions.zlib).to.match(/\d+\.\d+\.\d+/);
    expect(metrics.npmPackageDescription).to.equal('Instana tracing and monitoring for Node.js based AWS Lambdas');
    expect(metrics.npmPackageName).to.equal('@instana/aws-lambda');
    expect(metrics.npmPackageVersion).to.match(/\d+\.\d+\.\d+/);
  }
});
