/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const path = require('path');
const { expect } = require('chai');
const { fail } = expect;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../../../core/test/config');
const { retry, stringifyItems, delay } = require('../../../../../../../core/test/test_util');
const ProcessControls = require('../../../../../test_util/ProcessControls');
const globalAgent = require('../../../../../globalAgent');
const { verifyHttpRootEntry, verifyExitSpan } = require('@instana/core/test/test_util/common_verifications');

const SPAN_NAME = 'aws.lambda.invoke';
const functionName = 'wrapped-async';
let mochaSuiteFn;

const withErrorOptions = [false, true];
const requestMethods = ['Callback', 'Promise'];
const availableOperations = ['invoke', 'invokeAsync'];

const getNextCallMethod = require('@instana/core/test/test_util/circular_list').getCircularList(requestMethods);

if (!supportedVersion(process.versions.node)) {
  mochaSuiteFn = describe.skip;
} else {
  mochaSuiteFn = describe;
}

const retryTime = config.getTestTimeout() * 2;

mochaSuiteFn('tracing/cloud/aws-sdk/v2/lambda', function () {
  this.timeout(config.getTestTimeout() * 3);
  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;
  describe('tracing enabled, no suppression', function () {
    const appControls = new ProcessControls({
      appPath: path.join(__dirname, 'app'),
      port: 3215,
      useGlobalAgent: true,
      env: {
        AWS_LAMBDA_FUNCTION_NAME: functionName
      }
    });
    ProcessControls.setUpHooksWithRetryTime(retryTime, appControls);
    withErrorOptions.forEach(withError => {
      describe(`getting result with error: ${withError ? 'yes' : 'no'}`, () => {
        availableOperations.forEach(operation => {
          const requestMethod = getNextCallMethod();
          it(`operation: ${operation}/${requestMethod}`, async () => {
            const withErrorOption = withError ? '&withError=1' : '';
            const apiPath = `/${operation}/${requestMethod}`;
            const response = await appControls.sendRequest({
              method: 'GET',
              path: `${apiPath}?ctx=1${withErrorOption}`,
              simple: withError === false
            });
            return verify(appControls, response, apiPath, operation, withError);
          });
        });
      });
    });
    function verify(controls, response, apiPath, operation, withError) {
      return retry(() => {
        return agentControls
          .getSpans()
          .then(spans => verifySpans(controls, response, spans, apiPath, operation, withError));
      }, retryTime);
    }
    function verifySpans(controls, response, spans, apiPath, operation, withError) {
      const httpEntry = verifyHttpRootEntry({ spans, apiPath, pid: String(controls.getPid()) });
      verifyExitSpan({
        spanName: SPAN_NAME,
        spans,
        parent: httpEntry,
        withError,
        pid: String(controls.getPid()),
        extraTests: [
          span => expect(span.data[SPAN_NAME].function).to.equal(functionName),
          span => expect(span.data[SPAN_NAME].type).to.equal(span.data[SPAN_NAME].type ? 'RequestResponse' : undefined),
          span => {
            if (operation === 'invoke' && !withError) {
              const clientContextString = Buffer.from(response.data.clientContext || '', 'base64').toString();

              const clientContext = JSON.parse(clientContextString);
              expect(clientContext.Custom['x-instana-s']).to.equal(span.s);
              expect(clientContext.Custom['x-instana-t']).to.equal(span.t);
              expect(clientContext.Custom.awesome_company, 'The original Custom values must be untouched').to.equal(
                'Instana'
              );
            }
          }
        ]
      });
    }
  });

  describe('tracing disabled', () => {
    this.timeout(config.getTestTimeout() * 2);
    const appControls = new ProcessControls({
      appPath: path.join(__dirname, 'app'),
      port: 3215,
      useGlobalAgent: true,
      tracingEnabled: false,
      env: {
        AWS_LAMBDA_FUNCTION_NAME: functionName
      }
    });
    ProcessControls.setUpHooksWithRetryTime(retryTime, appControls);
    describe('attempt to get result', () => {
      availableOperations.forEach(operation => {
        const requestMethod = getNextCallMethod();
        it(`should not trace (${operation}/${requestMethod})`, async () => {
          await appControls.sendRequest({
            method: 'GET',
            path: `/${operation}/${requestMethod}`
          });
          return retry(() => delay(config.getTestTimeout() / 4))
            .then(() => agentControls.getSpans())
            .then(spans => {
              if (spans.length > 0) {
                fail(`Unexpected spans AWS Lambda invoke function suppressed: ${stringifyItems(spans)}`);
              }
            });
        });
      });
    });
  });

  describe('tracing enabled but suppressed', () => {
    const appControls = new ProcessControls({
      appPath: path.join(__dirname, 'app'),
      port: 3215,
      useGlobalAgent: true,
      env: {
        AWS_LAMBDA_FUNCTION_NAME: functionName
      }
    });
    ProcessControls.setUpHooksWithRetryTime(retryTime, appControls);
    describe('attempt to get result', () => {
      availableOperations.forEach(operation => {
        const requestMethod = getNextCallMethod();
        it(`should not trace (${operation}/${requestMethod})`, async () => {
          await appControls.sendRequest({
            suppressTracing: true,
            method: 'GET',
            path: `/${operation}/${requestMethod}`
          });
          return retry(() => delay(config.getTestTimeout() / 4), retryTime)
            .then(() => agentControls.getSpans())
            .then(spans => {
              if (spans.length > 0) {
                fail(`Unexpected spans AWS Lambda invoke function suppressed: ${stringifyItems(spans)}`);
              }
            });
        });
      });
    });
  });
});
