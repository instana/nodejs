/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const expect = require('chai').expect;
const path = require('path');
const constants = require('@instana/core').tracing.constants;

const Control = require('../Control');
const delay = require('../../../core/test/test_util/delay');
const expectExactlyOneMatching = require('../../../core/test/test_util/expectExactlyOneMatching');
const config = require('@instana/core/test/config');
const retry = require('@instana/core/test/test_util/retry');

const functionName = 'functionName';
const unqualifiedArn = `arn:aws:lambda:us-east-2:767398002385:function:${functionName}`;
const version = '$LATEST';
const qualifiedArn = `${unqualifiedArn}:${version}`;

const instanaAgentKey = 'aws-lambda-dummy-key';

function prelude(opts) {
  const env = {};
  if (opts.error) {
    env.LAMDBA_ERROR = opts.error;
  }
  if (opts.instanaEndpointUrlMissing) {
    env.INSTANA_ENDPOINT_URL = '';
  }
  if (opts.instanaAgentKeyMissing) {
    env.INSTANA_AGENT_KEY = '';
  }
  if (opts.instanaAgentKey) {
    env.INSTANA_AGENT_KEY = opts.instanaAgentKey;
  }
  if (opts.withConfig) {
    env.WITH_CONFIG = 'true';
  }

  // NOTE: locally we run "npm run test:debug" (INSTANA_DEBUG is on by default!)
  if (opts.disableInstanaDebug) {
    env.INSTANA_DEBUG = undefined;
  } else {
    env.INSTANA_DEBUG = 'true';
  }

  return env;
}

describe('Using the API', function () {
  this.timeout(config.getTestTimeout());
  this.slow(config.getTestTimeout() / 4);

  const handlerDefinitionPath = path.join(__dirname, './lambda');

  describe('when everything is peachy', function () {
    // - INSTANA_ENDPOINT_URL is configured
    // - INSTANA_AGENT_KEY is configured
    // - back end is reachable
    // - lambda function ends with success
    const env = prelude.bind(this)({
      handlerDefinitionPath,
      instanaAgentKey
    });

    let control;

    before(async () => {
      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath: handlerDefinitionPath,
        startBackend: true,
        env
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
      return verify(control, false, true);
    });
  });

  describe('when everything is peachy with https', function () {
    // - INSTANA_ENDPOINT_URL is configured
    // - INSTANA_AGENT_KEY is configured
    // - back end is reachable
    // - lambda function ends with success
    const env = prelude.bind(this)({
      handlerDefinitionPath,
      instanaAgentKey
    });

    let control;

    before(async () => {
      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath: handlerDefinitionPath,
        startBackend: true,
        backendUsesHttps: true,
        env
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
      return verify(control, false, true, true, true);
    });
  });

  describe('when lambda function yields an error', function () {
    // - INSTANA_ENDPOINT_URL is configured
    // - back end is reachable
    // - lambda function ends with an error
    const env = prelude.bind(this)({
      handlerDefinitionPath,
      instanaAgentKey,
      error: true
    });

    let control;

    before(async () => {
      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath: handlerDefinitionPath,
        startBackend: true,
        env
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
      return verify(control, true, true);
    });
  });

  describe('with config', function () {
    // - INSTANA_ENDPOINT_URL is configured
    // - back end is reachable
    // - client provides a config object
    // - lambda function ends with success
    const env = prelude.bind(this)({
      handlerDefinitionPath,
      instanaAgentKey,
      withConfig: true
    });

    let control;

    before(async () => {
      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath: handlerDefinitionPath,
        startBackend: true,
        env
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
      return verify(control, false, true);
    });
  });

  describe('with INSTANA_DEBUG false', function () {
    // - INSTANA_ENDPOINT_URL is configured
    // - back end is reachable
    // - client provides a config object
    // - lambda function ends with success
    const env = prelude.bind(this)({
      handlerDefinitionPath,
      instanaAgentKey,
      disableInstanaDebug: true
    });

    let control;

    before(async () => {
      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath: handlerDefinitionPath,
        startBackend: true,

        env
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
      return verify(control, false, true, false);
    });
  });

  describe('with config, when lambda function yields an error', function () {
    // - INSTANA_ENDPOINT_URL is configured
    // - back end is reachable
    // - client provides a config object
    // - lambda function ends with an error
    const env = prelude.bind(this)({
      handlerDefinitionPath,
      instanaAgentKey,
      withConfig: true,
      error: true
    });

    let control;

    before(async () => {
      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath: handlerDefinitionPath,
        startBackend: true,
        env
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
      return verify(control, true, true);
    });
  });

  describe('when INSTANA_ENDPOINT_URL is missing', function () {
    // - INSTANA_ENDPOINT_URL is missing
    // - lambda function ends with success
    const env = prelude.bind(this)({
      handlerDefinitionPath,
      instanaEndpointUrlMissing: true,
      instanaAgentKey
    });

    let control;

    before(async () => {
      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath: handlerDefinitionPath,
        startBackend: true,
        env
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

    it('must ignore the missing URL gracefully', () => {
      return verify(control, false, false);
    });
  });

  describe('when INSTANA_ENDPOINT_URL is missing and the lambda function yields an error', function () {
    // - INSTANA_ENDPOINT_URL is missing
    // - lambda function ends with an error
    const env = prelude.bind(this)({
      handlerDefinitionPath,
      instanaAgentKey,
      instanaEndpointUrlMissing: true,
      error: true
    });

    let control;

    before(async () => {
      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath: handlerDefinitionPath,
        startBackend: true,
        env
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

    it('must ignore the missing URL gracefully', () => {
      return verify(control, true, false);
    });
  });

  describe('with config, when INSTANA_ENDPOINT_URL is missing', function () {
    // - INSTANA_ENDPOINT_URL is missing
    // - client provides a config
    // - lambda function ends with success
    const env = prelude.bind(this)({
      handlerDefinitionPath,
      instanaAgentKey,
      instanaEndpointUrlMissing: true,
      withConfig: true
    });

    let control;

    before(async () => {
      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath: handlerDefinitionPath,
        startBackend: true,
        env
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

    it('must ignore the missing URL gracefully', () => {
      return verify(control, false, false);
    });
  });

  describe('when INSTANA_AGENT_KEY is missing', function () {
    // - INSTANA_AGENT_KEY is missing
    // - INSTANA_ENDPOINT_URL is configured
    const env = prelude.bind(this)({
      handlerDefinitionPath,
      instanaAgentKeyMissing: true
    });

    let control;

    before(async () => {
      control = new Control({
        faasRuntimePath: path.join(__dirname, '../runtime_mock'),
        handlerDefinitionPath: handlerDefinitionPath,
        startBackend: true,
        env
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

    it('must not expect spans or metrics', () => {
      return verify(control, false, false);
    });
  });

  function verify(control, error, expectSpansAndMetrics, isDebug = true, backendUsesHttps = false) {
    return control.runHandler().then(() => {
      verifyResponse(control, error, expectSpansAndMetrics, isDebug, backendUsesHttps);

      if (expectSpansAndMetrics) {
        return retry(() => getAndVerifySpans(control, error).then(() => getAndVerifyMetrics(control)));
      } else {
        return delay(1000)
          .then(() => verifyNoSpans(control))
          .then(() => verifyNoMetrics(control));
      }
    });
  }

  function verifyResponse(control, error, expectSpansAndMetrics, isDebug, backendUsesHttps) {
    /* eslint-disable no-console */
    if (error) {
      expect(control.getLambdaErrors().length).to.equal(1);
      expect(control.getLambdaResults()).to.be.empty;
      const lambdaError = control.getLambdaErrors()[0];
      expect(lambdaError).to.exist;
      expect(lambdaError.message).to.equal('Boom!');
      // other error cases like 'http' are checked in verifyLambdaEntry
    } else {
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

      expect(body.logs).to.be.an('object');
      expect(body.currentSpan).to.be.an('object');

      if (expectSpansAndMetrics) {
        // eslint-disable-next-line
        console.log('comparing expected debug logs to:', body.logs.debug);

        if (isDebug) {
          expect(body.logs.debug).to.satisfy(logs => {
            return logs.some(log => /\[instana_\w+\] Sending data to Instana \(\/serverless\/bundle\)/.test(log));
          });

          expect(body.logs.debug).to.satisfy(logs => {
            return logs.some(log => /\[instana_\w+\] Sent data to Instana \(\/serverless\/bundle\)/.test(log));
          });

          // We run http by default in the tests. No need to set INSTANA_DISABLE_CA_CHECK
          if (backendUsesHttps) {
            expect(body.logs.warn).to.satisfy(logs => {
              return logs.some(log =>
                // eslint-disable-next-line max-len
                /\[instana_\w+\] INSTANA_DISABLE_CA_CHECK is set/.test(log)
              );
            });
          } else {
            expect(body.logs.warn).to.not.satisfy(logs => {
              return logs.some(log =>
                // eslint-disable-next-line max-len
                /\[instana_\w+\] INSTANA_DISABLE_CA_CHECK is set/.test(log)
              );
            });
          }
        } else {
          expect(body.logs.debug).to.satisfy(logs => {
            return logs.some(log => /\[instana] Sending data to Instana \(\/serverless\/bundle\)/.test(log));
          });

          expect(body.logs.debug).to.satisfy(logs => {
            return logs.some(log => /\[instana] Sent data to Instana \(\/serverless\/bundle\)/.test(log));
          });

          expect(body.logs.warn).to.satisfy(logs => {
            return logs.some(log =>
              // eslint-disable-next-line max-len
              /\[instana] INSTANA_DISABLE_CA_CHECK is set/.test(log)
            );
          });
        }

        expect(body.logs.error).to.be.empty;
        expect(body.currentSpanConstructor).to.equal('SpanHandle');
        expect(body.currentSpan).to.exist;
        expect(body.currentSpan.span).to.exist;
        expect(body.currentSpan.span.n).to.equal('aws.lambda.entry');
      } else {
        expect(body.currentSpanConstructor).to.equal('NoopSpanHandle');
        expect(body.currentSpan).to.deep.equal({});
      }
    }
  }

  function verifyNoSpans(control) {
    return control.getSpans().then(spans => {
      expect(spans).to.be.empty;
    });
  }

  function getAndVerifySpans(control, error) {
    return control.getSpans().then(spans => verifySpans(spans, error));
  }

  function verifySpans(spans, error) {
    const entry = verifyLambdaEntry(spans, error);
    verifySdkExit(spans, entry);
  }

  function verifyLambdaEntry(spans, error) {
    return expectExactlyOneMatching(spans, span => {
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
      if (error) {
        expect(span.data.lambda.error).to.equal('Boom!');
        expect(span.error).to.not.exist;
        expect(span.ec).to.equal(1);
      } else {
        expect(span.data.lambda.error).to.not.exist;
        expect(span.error).to.not.exist;
        expect(span.ec).to.equal(0);
      }
      verifyHeaders(span);
    });
  }

  function verifySdkExit(spans, entry) {
    return expectExactlyOneMatching(spans, span => {
      expect(span.t).to.equal(entry.t);
      expect(span.p).to.equal(entry.s);
      expect(span.s).to.exist;
      expect(span.n).to.equal('sdk');
      expect(span.k).to.equal(constants.EXIT);
      expect(span.f).to.be.an('object');
      expect(span.f.h).to.not.exist;
      expect(span.f.cp).to.equal('aws');
      expect(span.f.hl).to.be.true;
      expect(span.f.e).to.equal(qualifiedArn);
      expect(span.async).to.not.exist;
      expect(span.data.sdk).to.be.an('object');
      expect(span.data.sdk.name).to.equal('custom-span');
      expect(span.data.sdk.type).to.equal('exit');
      verifyHeaders(span);
    });
  }

  function verifyNoMetrics(control) {
    return control.getMetrics().then(metrics => {
      expect(metrics).to.be.empty;
    });
  }

  function getAndVerifyMetrics(control) {
    return control.getMetrics().then(metrics => verifyMetrics(metrics));
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
    verifyHeaders(allPlugins);
  }

  function verifyHeaders(payload) {
    const headers = payload._receivedHeaders;
    expect(headers).to.exist;
    expect(headers['x-instana-host']).to.equal(qualifiedArn);
    expect(headers['x-instana-key']).to.equal(instanaAgentKey);
    expect(headers['x-instana-time']).to.not.exist;
  }
});
