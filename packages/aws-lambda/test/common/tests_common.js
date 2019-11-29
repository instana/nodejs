/* eslint-env mocha */

'use strict';

const expect = require('chai').expect;
const path = require('path');
const constants = require('@instana/core').tracing.constants;

const config = require('../../../serverless/test/config');
const delay = require('../../../serverless/test/util/delay');
const expectOneMatching = require('../../../serverless/test/util/expect_matching');
const retry = require('../../../serverless/test/util/retry');

const functionName = 'functionName';
const unqualifiedArn = `arn:aws:lambda:us-east-2:410797082306:function:${functionName}`;
const version = '$LATEST';
const qualifiedArn = `${unqualifiedArn}:${version}`;

function prelude(opts) {
  this.timeout(config.getTestTimeout());
  this.slow(config.getTestTimeout() / 4);

  if (opts.startBackend == null) {
    opts.startBackend = true;
  }

  const env = {
    INSTANA_EXTRA_HTTP_HEADERS: 'x-My-Favorite-Header;ANOTHER-HEADER'
  };
  if (opts.error) {
    env.LAMDBA_ERROR = opts.error;
  }
  if (opts.instanaEndpointUrl) {
    env.INSTANA_ENDPOINT_URL = opts.instanaEndpointUrl;
  }
  // INSTANA_URL/instanaUrl is deprecated and will be removed before GA - use INSTANA_ENDPOINT_URL/instanaEndpointUrl
  if (opts.instanaUrl) {
    env.INSTANA_URL = opts.instanaUrl;
  }
  if (opts.instanaAgentKey) {
    env.INSTANA_AGENT_KEY = opts.instanaAgentKey;
  }
  // INSTANA_KEY/instanaKey is deprecated and will be removed before GA - use INSTANA_AGENT_KEY/instanaAgentKey
  if (opts.instanaKey) {
    env.INSTANA_KEY = opts.instanaKey;
  }
  if (opts.withConfig) {
    env.WITH_CONFIG = 'true';
  }
  if (opts.trigger) {
    env.LAMBDA_TRIGGER = opts.trigger;
  }
  if (opts.statusCode) {
    env.HTTP_STATUS_CODE = opts.statusCode;
  }
  if (opts.traceId) {
    env.INSTANA_HEADER_T = opts.traceId;
  }
  if (opts.spanId) {
    env.INSTANA_HEADER_S = opts.spanId;
  }
  if (opts.traceLevel) {
    env.INSTANA_HEADER_L = opts.traceLevel;
  }
  if (opts.serverTiming) {
    env.SERVER_TIMING_HEADER = opts.serverTiming;
  }

  const Control = require('../../../serverless/test/util/control');
  const control = new Control({
    faasRuntimePath: path.join(__dirname, '../runtime_mock'),
    handlerDefinitionPath: opts.handlerDefinitionPath,
    startBackend: opts.startBackend,
    env
  });
  control.registerTestHooks();
  return control;
}

exports.registerTests = function registerTests(handlerDefinitionPath) {
  describe('when everything is peachy', function() {
    // - INSTANA_ENDPOINT_URL is configured
    // - INSTANA_AGENT_KEY is configured
    // - backend is reachable
    // - lambda function ends with success
    const control = prelude.bind(this)({
      handlerDefinitionPath,
      instanaEndpointUrl: config.backendBaseUrl,
      instanaAgentKey: config.instanaAgentKey
    });

    it('must capture metrics and spans', () => verify(control, false, true, true));
  });

  describe('when deprecated env var keys are used', function() {
    // - INSTANA_URL is configured (instead of INSTANA_ENDPOINT_URL)
    // - INSTANA_KEY is configured (instead of INSTANA_AGENT_KEY)
    // - backend is reachable
    // - lambda function ends with success
    const control = prelude.bind(this)({
      handlerDefinitionPath,
      instanaUrl: config.backendBaseUrl,
      instanaKey: config.instanaAgentKey
    });

    it('must capture metrics and spans', () => verify(control, false, true, true));
  });

  describe('when lambda function yields an error', function() {
    // - INSTANA_ENDPOINT_URL is configured
    // - backend is reachable
    // - lambda function ends with an error
    const control = prelude.bind(this)({
      handlerDefinitionPath,
      instanaEndpointUrl: config.backendBaseUrl,
      instanaAgentKey: config.instanaAgentKey,
      error: 'asynchronous'
    });

    it('must capture metrics and spans', () => verify(control, 'lambda-asynchronous', true, true));
  });

  describe('when lambda function throws a synchronous error', function() {
    // - INSTANA_ENDPOINT_URL is configured
    // - backend is reachable
    // - lambda function ends with an error
    const control = prelude.bind(this)({
      handlerDefinitionPath,
      instanaEndpointUrl: config.backendBaseUrl,
      instanaAgentKey: config.instanaAgentKey,
      error: 'synchronous'
    });

    it('must capture metrics and spans', () => verify(control, 'lambda-synchronous', true, true));
  });

  describe('with config', function() {
    // - INSTANA_ENDPOINT_URL is configured
    // - backend is reachable
    // - client provides a config object
    // - lambda function ends with success
    const control = prelude.bind(this)({
      handlerDefinitionPath,
      instanaEndpointUrl: config.backendBaseUrl,
      instanaAgentKey: config.instanaAgentKey,
      withConfig: true
    });

    it('must capture metrics and spans', () => verify(control, false, true, true));
  });

  describe('with config, when lambda function yields an error', function() {
    // - INSTANA_ENDPOINT_URL is configured
    // - backend is reachable
    // - client provides a config object
    // - lambda function ends with an error
    const control = prelude.bind(this)({
      handlerDefinitionPath,
      instanaEndpointUrl: config.backendBaseUrl,
      instanaAgentKey: config.instanaAgentKey,
      withConfig: true,
      error: 'asynchronous'
    });

    it('must capture metrics and spans', () => verify(control, 'lambda-asynchronous', true, true));
  });

  describe('when INSTANA_ENDPOINT_URL is missing', function() {
    // - INSTANA_ENDPOINT_URL is missing
    // - lambda function ends with success
    const control = prelude.bind(this)({
      handlerDefinitionPath,
      instanaAgentKey: config.instanaAgentKey
    });

    it('must ignore the missing URL gracefully', () => verify(control, false, false, false));
  });

  describe('when INSTANA_ENDPOINT_URL is missing and the lambda function yields an error', function() {
    // - INSTANA_ENDPOINT_URL is missing
    // - lambda function ends with an error
    const control = prelude.bind(this)({
      handlerDefinitionPath,
      instanaAgentKey: config.instanaAgentKey,
      error: 'asynchronous'
    });

    it('must ignore the missing URL gracefully', () => verify(control, 'lambda-asynchronous', false, false));
  });

  describe('with config, when INSTANA_ENDPOINT_URL is missing', function() {
    // - INSTANA_ENDPOINT_URL is missing
    // - client provides a config
    // - lambda function ends with success
    const control = prelude.bind(this)({
      handlerDefinitionPath,
      instanaAgentKey: config.instanaAgentKey,
      withConfig: true
    });

    it('must ignore the missing URL gracefully', () => verify(control, false, false, false));
  });

  describe('when INSTANA_AGENT_KEY is missing', function() {
    // - INSTANA_AGENT_KEY is missing
    // - lambda function ends with success
    const control = prelude.bind(this)({
      handlerDefinitionPath,
      instanaEndpointUrl: config.backendBaseUrl
    });

    it('must ignore the missing key gracefully', () => verify(control, false, false, false));
  });

  describe('when INSTANA_AGENT_KEY is missing and the lambda function yields an error', function() {
    // - INSTANA_AGENT_KEY is missing
    // - lambda function ends with an error
    const control = prelude.bind(this)({
      handlerDefinitionPath,
      instanaEndpointUrl: config.backendBaseUrl,
      error: 'asynchronous'
    });

    it('must ignore the missing key gracefully', () => verify(control, 'lambda-asynchronous', false, false));
  });

  describe('when backend is down', function() {
    // - INSTANA_ENDPOINT_URL is configured
    // - backend is not reachable
    // - lambda function ends with success
    const control = prelude.bind(this)({
      handlerDefinitionPath,
      instanaEndpointUrl: config.backendBaseUrl,
      instanaAgentKey: config.instanaAgentKey,
      startBackend: false
    });

    it('must ignore the failed request gracefully', () => verify(control, false, false, false));
  });

  describe('when backend is down and the lambda function yields an error', function() {
    // - INSTANA_ENDPOINT_URL is configured
    // - backend is not reachable
    // - lambda function ends with an error
    const control = prelude.bind(this)({
      handlerDefinitionPath,
      instanaEndpointUrl: config.backendBaseUrl,
      instanaAgentKey: config.instanaAgentKey,
      startBackend: false,
      error: 'asynchronous'
    });

    it('must ignore the failed request gracefully', () => verify(control, 'lambda-asynchronous', false, false));
  });

  describe('when backend is reachable but does not respond', function() {
    // - INSTANA_ENDPOINT_URL is configured
    // - backend is reachable, but will never respond (verifies that a reasonable timeout is applied -
    //   the default timeout would be two minutes)
    // - lambda function ends with success
    const control = prelude.bind(this)({
      handlerDefinitionPath,
      instanaEndpointUrl: config.backendBaseUrl,
      instanaAgentKey: config.instanaAgentKey,
      startBackend: 'unresponsive'
    });

    it('must finish swiftly', () => verify(control, false, false, false));
  });

  describe('triggered by API Gateway (Lambda Proxy)', function() {
    // - same as "everything is peachy"
    // - but triggered by AWS API Gateway (with Lambda Proxy)
    const control = prelude.bind(this)({
      handlerDefinitionPath,
      trigger: 'api-gateway-proxy',
      statusCode: 200,
      instanaEndpointUrl: config.backendBaseUrl,
      instanaAgentKey: config.instanaAgentKey
    });

    it('must recognize API gateway trigger (with proxy)', () =>
      verify(control, false, true, true, 'aws:api.gateway')
        .then(() => control.getSpans())
        .then(spans =>
          expectOneMatching(spans, span => {
            expect(span.n).to.equal('aws.lambda.entry');
            expect(span.k).to.equal(constants.ENTRY);
            expect(span.data.http).to.be.an('object');
            expect(span.data.http.method).to.equal('POST');
            expect(span.data.http.url).to.equal('/path/to/path-xxx/path-yyy');
            expect(span.data.http.path_tpl).to.equal('/path/to/{param1}/{param2}');
            expect(span.data.http.params).to.equal('param1=param-value&param1=another-param-value&param2=param-value');
            expect(span.data.http.header).to.deep.equal({
              'X-mY-favorite-header': 'A Header Value',
              'Another-Header': 'Another Header Value'
            });
            expect(span.data.http.host).to.not.exist;
            expect(span.data.http.status).to.equal(200);
          })
        ));
  });

  describe('triggered by API Gateway (Lambda Proxy) with parent span', function() {
    // - same as "everything is peachy"
    // - but triggered by AWS API Gateway (with Lambda Proxy)
    // - with an incoming parent span
    const control = prelude.bind(this)({
      handlerDefinitionPath,
      trigger: 'api-gateway-proxy',
      instanaEndpointUrl: config.backendBaseUrl,
      instanaAgentKey: config.instanaAgentKey,
      statusCode: 201,
      traceId: 'test-trace-id',
      spanId: 'test-span-id'
    });

    it('must recognize API gateway trigger (with proxy) with parent span', () =>
      verify(control, false, true, true, 'aws:api.gateway', {
        t: 'test-trace-id',
        s: 'test-span-id'
      })
        .then(() => control.getSpans())
        .then(spans =>
          expectOneMatching(spans, span => {
            expect(span.n).to.equal('aws.lambda.entry');
            expect(span.k).to.equal(constants.ENTRY);
            expect(span.data.http).to.be.an('object');
            expect(span.data.http.method).to.equal('POST');
            expect(span.data.http.url).to.equal('/path/to/path-xxx/path-yyy');
            expect(span.data.http.path_tpl).to.equal('/path/to/{param1}/{param2}');
            expect(span.data.http.params).to.equal('param1=param-value&param1=another-param-value&param2=param-value');
            expect(span.data.http.host).to.not.exist;
            expect(span.data.http.status).to.equal(201);
          })
        ));
  });

  describe('triggered by API Gateway (Lambda Proxy) with suppression', function() {
    // - same as triggered by AWS API Gateway (with Lambda Proxy)
    // - but with an incoming trace level header to suppress tracing
    const control = prelude.bind(this)({
      handlerDefinitionPath,
      trigger: 'api-gateway-proxy',
      instanaEndpointUrl: config.backendBaseUrl,
      instanaAgentKey: config.instanaAgentKey,
      traceLevel: '0'
    });

    it('must not trace when suppressed', () => verify(control, false, true, false));
  });

  describe('HTTP errors', function() {
    const control = prelude.bind(this)({
      handlerDefinitionPath,
      trigger: 'api-gateway-proxy',
      instanaEndpointUrl: config.backendBaseUrl,
      instanaAgentKey: config.instanaAgentKey,
      statusCode: 502
    });

    it('must capture HTTP error codes >= 500', () =>
      verify(control, 'http', true, true, 'aws:api.gateway')
        .then(() => control.getSpans())
        .then(spans =>
          expectOneMatching(spans, span => {
            expect(span.n).to.equal('aws.lambda.entry');
            expect(span.k).to.equal(constants.ENTRY);
            expect(span.data.http).to.be.an('object');
            expect(span.data.http.method).to.equal('POST');
            expect(span.data.http.url).to.equal('/path/to/path-xxx/path-yyy');
            expect(span.data.http.path_tpl).to.equal('/path/to/{param1}/{param2}');
            expect(span.data.http.params).to.equal('param1=param-value&param1=another-param-value&param2=param-value');
            expect(span.data.http.host).to.not.exist;
            expect(span.data.http.status).to.equal(502);
          })
        ));
  });

  describe('API Gateway/EUM - no Server-Timing header of its own', function() {
    const control = prelude.bind(this)({
      handlerDefinitionPath,
      trigger: 'api-gateway-proxy',
      instanaEndpointUrl: config.backendBaseUrl,
      instanaAgentKey: config.instanaAgentKey
    });

    it('must inject the Server-Timing header', () => {
      let serverTimingValue = null;
      return verify(control, false, true, true, 'aws:api.gateway')
        .then(() => {
          const response = control.getLambdaResults()[0];
          serverTimingValue = getHeaderCaseInsensitive(response.headers, 'server-timing');
          expect(serverTimingValue).to.match(/^intid;desc=[0-9a-f]+$/);
        })
        .then(() => control.getSpans())
        .then(spans =>
          expectOneMatching(spans, span => {
            expect(span.n).to.equal('aws.lambda.entry');
            expect(span.k).to.equal(constants.ENTRY);
            expect(/^intid;desc=([0-9a-f]+)$/.exec(serverTimingValue)[1]).to.equal(span.t);
          })
        );
    });
  });

  describe('API Gateway/EUM - Server-Timing string header already present', function() {
    const control = prelude.bind(this)({
      handlerDefinitionPath,
      trigger: 'api-gateway-proxy',
      instanaEndpointUrl: config.backendBaseUrl,
      instanaAgentKey: config.instanaAgentKey,
      serverTiming: 'string'
    });

    it('must inject the Server-Timing header', () => {
      let serverTimingValue = null;
      return verify(control, false, true, true, 'aws:api.gateway')
        .then(() => {
          const response = control.getLambdaResults()[0];
          serverTimingValue = getHeaderCaseInsensitive(response.headers, 'server-timing');
          expect(serverTimingValue).to.match(/^cache;desc="Cache Read";dur=23.2, intid;desc=[0-9a-f]+$/);
        })
        .then(() => control.getSpans())
        .then(spans =>
          expectOneMatching(spans, span => {
            expect(span.n).to.equal('aws.lambda.entry');
            expect(span.k).to.equal(constants.ENTRY);
            expect(/^cache;desc="Cache Read";dur=23.2, intid;desc=([0-9a-f]+)$/.exec(serverTimingValue)[1]).to.equal(
              span.t
            );
          })
        );
    });
  });

  describe('API Gateway/EUM - Server-Timing array header already present', function() {
    const control = prelude.bind(this)({
      handlerDefinitionPath,
      trigger: 'api-gateway-proxy',
      instanaEndpointUrl: config.backendBaseUrl,
      instanaAgentKey: config.instanaAgentKey,
      serverTiming: 'array'
    });

    it('must add our Server-Timing value to the first entry in the multi value header array', () => {
      let serverTimingValue = null;
      return verify(control, false, true, true, 'aws:api.gateway')
        .then(() => {
          const response = control.getLambdaResults()[0];
          const serverTimingValueArray = getHeaderCaseInsensitive(response.multiValueHeaders, 'server-timing');
          expect(serverTimingValueArray).to.have.length(2);
          expect(serverTimingValueArray[0]).to.match(/^cache;desc="Cache Read";dur=23.2, intid;desc=([0-9a-f]+)$/);
          expect(serverTimingValueArray[1]).to.equal('cpu;dur=2.4');
          serverTimingValue = serverTimingValueArray[0];
        })
        .then(() => control.getSpans())
        .then(spans =>
          expectOneMatching(spans, span => {
            expect(span.n).to.equal('aws.lambda.entry');
            expect(span.k).to.equal(constants.ENTRY);
            expect(/^cache;desc="Cache Read";dur=23.2, intid;desc=([0-9a-f]+)$/.exec(serverTimingValue)[1]).to.equal(
              span.t
            );
          })
        );
    });
  });

  describe('triggered by API Gateway (no Lambda Proxy)', function() {
    // - same as "everything is peachy"
    // - but triggered by AWS API Gateway (without Lambda Proxy)
    const control = prelude.bind(this)({
      handlerDefinitionPath,
      trigger: 'api-gateway-no-proxy',
      instanaEndpointUrl: config.backendBaseUrl,
      instanaAgentKey: config.instanaAgentKey
    });

    it('must recognize API gateway trigger (without proxy)', () =>
      verify(control, false, true, true, 'aws:api.gateway.noproxy')
        .then(() => control.getSpans())
        .then(spans =>
          expectOneMatching(spans, span => {
            expect(span.n).to.equal('aws.lambda.entry');
            expect(span.k).to.equal(constants.ENTRY);
            expect(span.data.http).to.not.exist;
          })
        ));
  });

  describe('triggered by an application load balancer', function() {
    // - same as "everything is peachy"
    // - but triggered by an application load balancer
    const control = prelude.bind(this)({
      handlerDefinitionPath,
      trigger: 'application-load-balancer',
      instanaEndpointUrl: config.backendBaseUrl,
      instanaAgentKey: config.instanaAgentKey
    });

    it('must recognize the application load balancer trigger', () =>
      verify(control, false, true, true, 'aws:application.load.balancer')
        .then(() => control.getSpans())
        .then(spans =>
          expectOneMatching(spans, span => {
            expect(span.n).to.equal('aws.lambda.entry');
            expect(span.k).to.equal(constants.ENTRY);
            expect(span.data.http).to.be.an('object');
            expect(span.data.http.method).to.equal('GET');
            expect(span.data.http.url).to.equal('/path/to/resource');
            expect(span.data.http.path_tpl).to.not.exist;
            expect(span.data.http.params).to.equal('param1=value1&param2=value2');
            expect(span.data.http.header).to.deep.equal({
              'X-mY-favorite-header': 'A Header Value',
              'Another-Header': 'Another Header Value'
            });
            expect(span.data.http.host).to.not.exist;
          })
        ));
  });

  describe('triggered by an application load balancer with parent span', function() {
    // - same as "everything is peachy"
    // - but triggered by an application load balancer
    // - with an incoming parent span
    const control = prelude.bind(this)({
      handlerDefinitionPath,
      trigger: 'application-load-balancer',
      instanaEndpointUrl: config.backendBaseUrl,
      instanaAgentKey: config.instanaAgentKey,
      traceId: 'test-trace-id',
      spanId: 'test-span-id'
    });

    it('must recognize the application load balancer trigger and parent span', () =>
      verify(control, false, true, true, 'aws:application.load.balancer', {
        t: 'test-trace-id',
        s: 'test-span-id'
      })
        .then(() => control.getSpans())
        .then(spans =>
          expectOneMatching(spans, span => {
            expect(span.n).to.equal('aws.lambda.entry');
            expect(span.k).to.equal(constants.ENTRY);
            expect(span.data.http).to.be.an('object');
            expect(span.data.http.method).to.equal('GET');
            expect(span.data.http.url).to.equal('/path/to/resource');
            expect(span.data.http.path_tpl).to.not.exist;
            expect(span.data.http.params).to.equal('param1=value1&param2=value2');
            expect(span.data.http.host).to.not.exist;
          })
        ));
  });

  describe('triggered by CloudWatch Events', function() {
    // - same as "everything is peachy"
    // - but triggered by AWS CloudWatch events
    const control = prelude.bind(this)({
      handlerDefinitionPath,
      trigger: 'cloudwatch-events',
      instanaEndpointUrl: config.backendBaseUrl,
      instanaAgentKey: config.instanaAgentKey
    });

    it('must recognize CloudWatch events trigger', () =>
      verify(control, false, true, true, 'aws:cloudwatch.events')
        .then(() => control.getSpans())
        .then(spans =>
          expectOneMatching(spans, span => {
            expect(span.n).to.equal('aws.lambda.entry');
            expect(span.k).to.equal(constants.ENTRY);
            expect(span.data.lambda.cw).to.be.an('object');
            expect(span.data.lambda.cw.events).to.be.an('object');
            expect(span.data.lambda.cw.events.resources).to.deep.equal([
              'arn:aws:events:us-east-2:XXXXXXXXXXXX:rule/lambda-tracing-trigger-test'
            ]);
            expect(span.data.lambda.cw.events.more).to.be.false;
          })
        ));
  });

  describe('triggered by CloudWatch Logs', function() {
    // - same as "everything is peachy"
    // - but triggered by AWS CloudWatch logs
    const control = prelude.bind(this)({
      handlerDefinitionPath,
      trigger: 'cloudwatch-logs',
      instanaEndpointUrl: config.backendBaseUrl,
      instanaAgentKey: config.instanaAgentKey
    });

    it('must recognize CloudWatch logs trigger', () =>
      verify(control, false, true, true, 'aws:cloudwatch.logs')
        .then(() => control.getSpans())
        .then(spans =>
          expectOneMatching(spans, span => {
            expect(span.n).to.equal('aws.lambda.entry');
            expect(span.k).to.equal(constants.ENTRY);
            expect(span.data.lambda.cw).to.be.an('object');
            expect(span.data.lambda.cw.logs).to.be.an('object');
            expect(span.data.lambda.cw.logs.group).to.equal('/aws/lambda/callback_8_10');
            expect(span.data.lambda.cw.logs.stream).to.equal('2019/09/08/[$LATEST]3b71b6b86c614431bd1e42974f8eb981');
            expect(span.data.lambda.cw.logs.events).to.deep.equal([
              '2019-09-08T21:34:37.973Z\te390347f-34be-4a56-89bf-75a219fda2b3\tStarting up\n',
              '2019-09-08T21:34:37.975Z\te390347f-34be-4a56-89bf-75a219fda2b3\t' +
                'TypeError: callback is not a function\n    at exports.handler (/var/task/index.js:7:3)\n',
              'END RequestId: e390347f-34be-4a56-89bf-75a219fda2b3\n'
            ]);
            expect(span.data.lambda.cw.logs.more).to.be.true;
          })
        ));
  });

  describe('triggered by S3', function() {
    // - same as "everything is peachy"
    // - but triggered by AWS S3
    const control = prelude.bind(this)({
      handlerDefinitionPath,
      trigger: 's3',
      instanaEndpointUrl: config.backendBaseUrl,
      instanaAgentKey: config.instanaAgentKey
    });

    it('must recognize S3 trigger', () =>
      verify(control, false, true, true, 'aws:s3')
        .then(() => control.getSpans())
        .then(spans =>
          expectOneMatching(spans, span => {
            expect(span.n).to.equal('aws.lambda.entry');
            expect(span.k).to.equal(constants.ENTRY);
            expect(span.data.lambda.s3).to.be.an('object');
            expect(span.data.lambda.s3.events).to.be.an('array');
            expect(span.data.lambda.s3.events).to.have.length(3);
            expect(span.data.lambda.s3.events[0].event).to.equal('ObjectCreated:Put');
            expect(span.data.lambda.s3.events[0].bucket).to.equal('lambda-tracing-test');
            expect(span.data.lambda.s3.events[0].object).to.equal('test/');
            expect(span.data.lambda.s3.events[1].event).to.equal('ObjectCreated:Put');
            expect(span.data.lambda.s3.events[1].bucket).to.equal('lambda-tracing-test-2');
            expect(span.data.lambda.s3.events[1].object).to.equal('test/two');
            expect(span.data.lambda.s3.events[2].event).to.equal('ObjectCreated:Put');
            expect(span.data.lambda.s3.events[2].bucket).to.equal('lambda-tracing-test-3');
            expect(span.data.lambda.s3.events[2].object).to.equal('test/three');
            expect(span.data.lambda.s3.more).to.be.true;
          })
        ));
  });

  describe('triggered by SQS', function() {
    // - same as "everything is peachy"
    // - but triggered by AWS SQS
    const control = prelude.bind(this)({
      handlerDefinitionPath,
      trigger: 'sqs',
      instanaEndpointUrl: config.backendBaseUrl,
      instanaAgentKey: config.instanaAgentKey
    });

    it('must recognize SQS message trigger', () =>
      verify(control, false, true, true, 'aws:sqs')
        .then(() => control.getSpans())
        .then(spans =>
          expectOneMatching(spans, span => {
            expect(span.n).to.equal('aws.lambda.entry');
            expect(span.k).to.equal(constants.ENTRY);
            expect(span.data.lambda.sqs).to.be.an('object');
            expect(span.data.lambda.sqs.messages).to.be.an('array');
            expect(span.data.lambda.sqs.messages).to.have.length(1);
            expect(span.data.lambda.sqs.messages[0].queue).to.equal(
              'arn:aws:sqs:us-east-2:XXXXXXXXXXXX:lambda-tracing-test-queue'
            );
            expect(span.data.lambda.sqs.more).to.be.false;
          })
        ));
  });

  function verify(control, error, expectMetrics, expectSpans, trigger, parent) {
    /* eslint-disable no-console */
    if (error && error.startsWith('lambda')) {
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
      expect(result.headers).to.be.an('object');
      expect(result.headers['x-custom-header']).to.equal('custom header value');
      expect(result.body).to.deep.equal({ message: 'Stan says hi!' });
    }

    if (expectMetrics && expectSpans) {
      return retry(() =>
        getAndVerifySpans(control, error, trigger, parent).then(() => getAndVerifyMetrics(control, error))
      );
    } else if (!expectMetrics && expectSpans) {
      return retry(() => getAndVerifySpans(control, error, trigger, parent).then(() => verifyNoMetrics(control)));
    } else if (expectMetrics && !expectSpans) {
      return retry(() => getAndVerifyMetrics(control, error).then(() => verifyNoSpans(control)));
    } else {
      return delay(1000)
        .then(() => verifyNoSpans(control))
        .then(() => verifyNoMetrics(control));
    }
  }

  function verifyNoSpans(control) {
    return control.getSpans().then(spans => {
      expect(spans).to.be.empty;
    });
  }

  function getAndVerifySpans(control, error, expectedTrigger, expectParent) {
    return control.getSpans().then(spans => verifySpans(spans, error, expectedTrigger, expectParent));
  }

  function verifySpans(spans, error, expectedTrigger, expectParent) {
    const entry = verifyLambdaEntry(spans, error, expectedTrigger, expectParent);
    if (error !== 'lambda-synchronous') {
      verifyHttpExit(spans, entry);
    }
  }

  function verifyLambdaEntry(spans, error, expectedTrigger, expectParent) {
    return expectOneMatching(spans, span => {
      if (expectParent) {
        expect(span.t).to.equal(expectParent.t);
        expect(span.p).to.equal(expectParent.s);
      } else {
        expect(span.t).to.exist;
        expect(span.p).to.not.exist;
      }
      expect(span.s).to.exist;
      expect(span.n).to.equal('aws.lambda.entry');
      expect(span.k).to.equal(constants.ENTRY);
      expect(span.f).to.be.an('object');
      expect(span.f.h).to.not.exist;
      expect(span.f.hl).to.be.true;
      expect(span.f.cp).to.equal('aws');
      expect(span.f.e).to.equal(qualifiedArn);
      expect(span.async).to.equal(false);
      expect(span.data.lambda).to.be.an('object');
      expect(span.data.lambda.runtime).to.equal('nodejs');
      if (expectedTrigger) {
        expect(span.data.lambda.trigger).to.equal(expectedTrigger);
      }
      if (error && error.startsWith('lambda')) {
        expect(span.data.lambda.error).to.equal('Boom!');
        expect(span.error).to.be.true;
        expect(span.ec).to.equal(1);
      } else if (error === 'http') {
        expect(span.data.lambda.error).to.equal('HTTP status 502');
        expect(span.error).to.be.true;
        expect(span.ec).to.equal(1);
      } else if (error === false) {
        expect(span.data.lambda.error).to.not.exist;
        expect(span.error).to.be.false;
        expect(span.ec).to.equal(0);
      } else {
        throw new Error(`Unknown error expectation type, don't know how to verify: ${error}`);
      }
      verifyHeaders(span);
    });
  }

  function verifyHttpExit(spans, entry) {
    return expectOneMatching(spans, span => {
      expect(span.t).to.equal(entry.t);
      expect(span.p).to.equal(entry.s);
      expect(span.s).to.exist;
      expect(span.n).to.equal('node.http.client');
      expect(span.k).to.equal(constants.EXIT);
      expect(span.f).to.be.an('object');
      expect(span.f.h).to.not.exist;
      expect(span.f.cp).to.equal('aws');
      expect(span.f.hl).to.be.true;
      expect(span.f.e).to.equal(qualifiedArn);
      expect(span.async).to.equal(false);
      expect(span.data.http).to.be.an('object');
      expect(span.data.http.method).to.equal('GET');
      expect(span.data.http.url).to.equal(config.downstreamDummyUrl);
      verifyHeaders(span);
    });
  }

  function verifyNoMetrics(control) {
    return control.getMetrics().then(metrics => {
      expect(metrics).to.be.empty;
    });
  }

  function getAndVerifyMetrics(control, error) {
    return control.getMetrics().then(metrics => verifyMetrics(metrics, error));
  }

  function verifyMetrics(allMetrics, error) {
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
    verifyHeaders(allPlugins);
    if (error !== 'lambda-synchronous') {
      // A synchronous error terminates the Lambda really fast, so there might not have been enough time to collect
      // asynchronous metrics based on fs calls.
      expect(metrics.npmPackageDescription).to.equal('Instana tracing and monitoring for Node.js based AWS Lambdas');
      expect(metrics.npmPackageName).to.equal('@instana/aws-lambda');
      expect(metrics.npmPackageVersion).to.match(/\d+\.\d+\.\d+/);
    }
  }

  function verifyHeaders(payload) {
    const headers = payload._receivedHeaders;
    expect(headers).to.exist;
    expect(headers['x-instana-host']).to.equal(qualifiedArn);
    expect(headers['x-instana-key']).to.equal('dummy-key');
    expect(headers['x-instana-time']).to.be.a('string');
  }

  function getHeaderCaseInsensitive(headers, header) {
    let key = null;
    let value = null;
    Object.keys(headers).forEach(h => {
      if (header.toLowerCase() === h.toLowerCase()) {
        if (key != null) {
          throw new Error(`Found duplicated header: ${key} and ${h}.`);
        }
        key = h;
        value = headers[key];
      }
    });
    return value;
  }
};
