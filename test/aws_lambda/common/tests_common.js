/* eslint-env mocha */

'use strict';

const expect = require('chai').expect;
const path = require('path');
const constants = require('@instana/core').tracing.constants;

const config = require('../../config');
const delay = require('../../util/delay');
const expectOneMatching = require('../../util/expect_matching');
const retry = require('../../util/retry');

function prelude(opts) {
  this.timeout(config.getTestTimeout());
  this.slow(config.getTestTimeout() / 4);

  if (opts.startAcceptor == null) {
    opts.startAcceptor = true;
  }

  const env = {
    LAMDBA_ERROR: opts.error
  };
  if (opts.instanaUrl) {
    env.INSTANA_URL = opts.instanaUrl;
  }
  if (opts.instanaKey) {
    env.INSTANA_KEY = opts.instanaKey;
  }
  if (opts.withConfig) {
    env.WITH_CONFIG = 'true';
  }

  const Control = require('../../util/control');
  const control = new Control({
    faasRuntimePath: path.join(__dirname, '../runtime_mock'),
    handlerDefinitionPath: opts.handlerDefinitionPath,
    startAcceptor: opts.startAcceptor,
    env
  });
  control.registerTestHooks();
  return control;
}

exports.registerTests = function registerTests(handlerDefinitionPath) {
  describe('when everything is peachy', function() {
    // - INSTANA_URL is configured
    // - acceptor is reachable
    // - lambda function ends with success
    const control = prelude.bind(this)({
      handlerDefinitionPath,
      instanaUrl: config.acceptorBaseUrl,
      instanaKey: config.instanaKey
    });

    it('must capture metrics and spans', () => verify(control, false, true));
  });

  describe('when lambda function yields an error', function() {
    // - INSTANA_URL is configured
    // - acceptor is reachable
    // - lambda function ends with an error
    const control = prelude.bind(this)({
      handlerDefinitionPath,
      instanaUrl: config.acceptorBaseUrl,
      instanaKey: config.instanaKey,
      error: true
    });

    it('must capture metrics and spans', () => verify(control, true, true));
  });

  describe('with config', function() {
    // - INSTANA_URL is configured
    // - acceptor is reachable
    // - client provides a config object
    // - lambda function ends with success
    const control = prelude.bind(this)({
      handlerDefinitionPath,
      instanaUrl: config.acceptorBaseUrl,
      instanaKey: config.instanaKey,
      withConfig: true
    });

    it('must capture metrics and spans', () => verify(control, false, true));
  });

  describe('with config, when lambda function yields an error', function() {
    // - INSTANA_URL is configured
    // - acceptor is reachable
    // - client provides a config object
    // - lambda function ends with an error
    const control = prelude.bind(this)({
      handlerDefinitionPath,
      instanaUrl: config.acceptorBaseUrl,
      instanaKey: config.instanaKey,
      withConfig: true,
      error: true
    });

    it('must capture metrics and spans', () => verify(control, true, true));
  });

  describe('when INSTANA_URL is missing', function() {
    // - INSTANA_URL is missing
    // - lambda function ends with success
    const control = prelude.bind(this)({
      handlerDefinitionPath,
      instanaKey: config.instanaKey
    });

    it('must ignore the missing URL gracefully', () => verify(control, false, false));
  });

  describe('when INSTANA_URL is missing and the lambda function yields an error', function() {
    // - INSTANA_URL is missing
    // - lambda function ends with an error
    const control = prelude.bind(this)({
      handlerDefinitionPath,
      instanaKey: config.instanaKey,
      error: true
    });

    it('must ignore the missing URL gracefully', () => verify(control, true, false));
  });

  describe('with config, when INSTANA_URL is missing', function() {
    // - INSTANA_URL is missing
    // - client provides a config
    // - lambda function ends with success
    const control = prelude.bind(this)({
      handlerDefinitionPath,
      instanaKey: config.instanaKey,
      withConfig: true
    });

    it('must ignore the missing URL gracefully', () => verify(control, false, false));
  });

  describe('when INSTANA_KEY is missing', function() {
    // - INSTANA_KEY is missing
    // - lambda function ends with success
    const control = prelude.bind(this)({
      handlerDefinitionPath,
      instanaUrl: config.acceptorBaseUrl
    });

    it('must ignore the missing key gracefully', () => verify(control, false, false));
  });

  describe('when INSTANA_KEY is missing and the lambda function yields an error', function() {
    // - INSTANA_KEY is missing
    // - lambda function ends with an error
    const control = prelude.bind(this)({
      handlerDefinitionPath,
      instanaUrl: config.acceptorBaseUrl,
      error: true
    });

    it('must ignore the missing key gracefully', () => verify(control, true, false));
  });

  describe('when acceptor is down', function() {
    // - INSTANA_URL is configured
    // - acceptor is not reachable
    // - lambda function ends with success
    const control = prelude.bind(this)({
      handlerDefinitionPath,
      instanaUrl: config.acceptorBaseUrl,
      instanaKey: config.instanaKey,
      startAcceptor: false
    });

    it('must ignore the failed request gracefully', () => verify(control, false, false));
  });

  describe('when acceptor is down and the lambda function yields an error', function() {
    // - INSTANA_URL is configured
    // - acceptor is not reachable
    // - lambda function ends with an error
    const control = prelude.bind(this)({
      handlerDefinitionPath,
      instanaUrl: config.acceptorBaseUrl,
      instanaKey: config.instanaKey,
      startAcceptor: false,
      error: true
    });

    it('must ignore the failed request gracefully', () => verify(control, true, false));
  });

  describe('when acceptor is reachable but does not respond', function() {
    // - INSTANA_URL is configured
    // - acceptor is reachable, but will never respond (verifies that a reasonable timeout is applied -
    //   the default timeout would be two minutes)
    // - lambda function ends with success
    const control = prelude.bind(this)({
      handlerDefinitionPath,
      instanaUrl: config.acceptorBaseUrl,
      instanaKey: config.instanaKey,
      startAcceptor: 'unresponsive'
    });

    it('must finish swiftly', () => verify(control, false, false));
  });

  function verify(control, lambdaError, expectSpansAndMetrics) {
    /* eslint-disable no-console */
    if (lambdaError) {
      expect(control.getLambdaErrors().length).to.equal(1);
      expect(control.getLambdaResults()).to.be.empty;
      const error = control.getLambdaErrors()[0];
      expect(error).to.exist;
      expect(error.message).to.equal('Boom!');
    } else {
      if (control.getLambdaErrors() && control.getLambdaErrors().length > 0) {
        console.log('Unexpected Errors:');
        console.log(JSON.stringify(control.getLambdaErrors()));
      }
      expect(control.getLambdaErrors()).to.be.empty;
      expect(control.getLambdaResults().length).to.equal(1);
      const result = control.getLambdaResults()[0];
      expect(result).to.exist;
      expect(result.message).to.equal('Stan says hi!');
    }

    if (expectSpansAndMetrics) {
      // TODO Verify that metrics have been produced
      return retry(() => control.getSpans())
        .then(spans => expectSpans(spans, lambdaError))
        .then(() => control.getMetrics())
        .then(metrics => expectMetrics(metrics));
    } else {
      return delay(1000)
        .then(() => control.getSpans())
        .then(spans => {
          expect(spans).to.be.empty;
        })
        .then(() => control.getMetrics())
        .then(metrics => {
          expect(metrics).to.be.empty;
        });
    }
  }

  function expectSpans(spans, lambdaError) {
    const entry = expectLambdaEntry(spans, lambdaError);
    expectHttpExit(spans, entry);
  }

  function expectLambdaEntry(spans, lambdaError) {
    return expectOneMatching(spans, span => {
      expect(span.t).to.exist;
      expect(span.p).to.not.exist;
      expect(span.n).to.equal('aws.lambda.entry');
      expect(span.k).to.equal(constants.ENTRY);
      expect(span.f).to.be.an('object');
      expect(span.f.e).to.equal('arn:aws:lambda:us-east-2:410797082306:function:functionName:$LATEST');
      expect(span.async).to.equal(false);
      expect(span.data.lambda).to.be.an('object');
      if (lambdaError) {
        expect(span.data.lambda.error).to.equal('Boom!');
        expect(span.error).to.be.true;
        expect(span.ec).to.equal(1);
      } else {
        expect(span.data.lambda.error).to.not.exist;
        expect(span.error).to.be.false;
        expect(span.ec).to.equal(0);
      }
      expectHeaders(span);
    });
  }

  function expectHttpExit(spans, entry) {
    return expectOneMatching(spans, span => {
      expect(span.t).to.equal(entry.t);
      expect(span.p).to.equal(entry.s);
      expect(span.n).to.equal('node.http.client');
      expect(span.k).to.equal(constants.EXIT);
      expect(span.f).to.be.an('object');
      expect(span.f.e).to.equal('arn:aws:lambda:us-east-2:410797082306:function:functionName:$LATEST');
      expect(span.async).to.equal(false);
      expectHeaders(span);
    });
  }

  function expectMetrics(allMetrics) {
    expect(allMetrics).to.exist;
    expect(Array.isArray(allMetrics)).to.be.true;
    expect(allMetrics).to.have.lengthOf(1);
    const allPlugins = allMetrics[0];
    expect(allPlugins.plugins).to.have.lengthOf(1);
    const pluginData = allPlugins.plugins[0];
    expect(pluginData.data).to.exist;
    expect(pluginData.name).to.equal('com.instana.plugin.aws.lambda');
    expect(pluginData.entityId).to.equal('arn:aws:lambda:us-east-2:410797082306:function:functionName:$LATEST');
    const metrics = pluginData.data;
    expect(metrics.activeHandles).to.be.a('number');
    expect(metrics.activeRequests).to.be.a('number');
    // Not testing metrics that depend on fs actions, like 'dependencies', 'name' or 'description' - collection might
    // not have finished when we send metrics.
    expect(metrics.dependencies).to.exist;
    // expect(metrics.description).to.equal('Monitor serverless Node.js code with Instana');
    // expect(metrics.name).to.equal('@instana/serverless');
    expect(metrics.memory).to.exist;
    expect(metrics.healthchecks).to.exist;
    expect(metrics.heapSpaces).to.exist;
    expectHeaders(allPlugins);
  }

  function expectHeaders(payload) {
    const headers = payload._receivedHeaders;
    expect(headers).to.exist;
    expect(headers['x-instana-host']).to.equal('arn:aws:lambda:us-east-2:410797082306:function:functionName');
    expect(headers['x-instana-key']).to.equal('dummy-key');
    expect(headers['x-instana-time']).to.be.a('string');
  }
};
