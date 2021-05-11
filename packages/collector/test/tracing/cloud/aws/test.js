/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const path = require('path');
const { expect } = require('chai');
const { fail } = expect;
const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const { expectExactlyOneMatching, retry, stringifyItems, delay } = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');

const functionName = 'team-nodejs-invoke-function';
let mochaSuiteFn;

const withErrorOptions = [false, true];
const requestMethods = ['Callback', 'Promise', 'Async'];
const availableOperations = ['invoke', 'listBuckets', 'listTables', 'listStreams'];

let roundRobinIndex = 0;
function getMethodRoundRobin() {
  const len = requestMethods.length;
  return requestMethods[roundRobinIndex++ % len];
}

function getSpanName(operation) {
  switch (operation) {
    case 'invoke':
      return 'aws.lambda.invoke';
    case 'listBuckets':
      return 's3';
    case 'listTables':
      return 'dynamodb';
    case 'listStreams':
      return 'kinesis';
    default:
      return 'NOT-FOUND';
  }
}

if (!supportedVersion(process.versions.node)) {
  mochaSuiteFn = describe.skip;
} else {
  mochaSuiteFn = describe;
}

const retryTime = config.getTestTimeout() * 2;

mochaSuiteFn('tracing/cloud/aws/combined-products', function () {
  this.timeout(config.getTestTimeout() * 3);
  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;
  describe('tracing enabled, no suppression', function () {
    const appControls = new ProcessControls({
      appPath: path.join(__dirname, 'combined_products'),
      port: 3215,
      useGlobalAgent: true,
      env: {
        AWS_LAMBDA_FUNCTION_NAME: functionName
      }
    });
    ProcessControls.setUpHooksWithRetryTime(retryTime, appControls);
    withErrorOptions.forEach(withError => {
      describe(`getting result; with error: ${withError ? 'yes' : 'no'}`, () => {
        availableOperations.forEach(operation => {
          const requestMethod = getMethodRoundRobin();
          it(`operation: ${operation}/${requestMethod}`, async () => {
            const withErrorOption = withError ? '?withError=1' : '';
            const apiPath = `/${operation}/${requestMethod}`;
            const response = await appControls.sendRequest({
              method: 'GET',
              path: `${apiPath}${withErrorOption}`,
              simple: withError === false
            });
            return verify(appControls, response, apiPath, operation, withError);
          });
        });
      });
    });
    function verify(controls, response, apiPath, operation, withError) {
      return retry(() => {
        return agentControls.getSpans().then(spans => verifySpans(controls, spans, apiPath, operation, withError));
      }, retryTime);
    }
    function verifySpans(controls, spans, apiPath, operation, withError) {
      const httpEntry = verifyHttpEntry(spans, apiPath, controls);
      verifyAWSProductExit(spans, httpEntry, operation, withError);
    }
    function verifyHttpEntry(spans, apiPath, controls) {
      return expectExactlyOneMatching(spans, [
        span => expect(span.p).to.not.exist,
        span => expect(span.k).to.equal(constants.ENTRY),
        span => expect(span.f.e).to.equal(String(controls.getPid())),
        span => expect(span.f.h).to.equal('agent-stub-uuid'),
        span => expect(span.n).to.equal('node.http.server'),
        span => expect(span.data.http.url).to.equal(apiPath)
      ]);
    }
    function verifyAWSProductExit(spans, parent, operation, withError) {
      return expectExactlyOneMatching(spans, [
        span => expect(span.n).to.equal(getSpanName(operation)),
        span => expect(span.k).to.equal(constants.EXIT),
        span => expect(span.t).to.equal(parent.t),
        span => expect(span.p).to.equal(parent.s),
        span => expect(span.f.e).to.equal(String(appControls.getPid())),
        span => expect(span.f.h).to.equal('agent-stub-uuid'),
        span => expect(span.error).to.not.exist,
        span => expect(span.ec).to.equal(withError ? 1 : 0),
        span => expect(span.async).to.not.exist,
        span => expect(span.data).to.exist,
        span => expect(span.data[getSpanName(operation)]).to.be.an('object'),
        span => {
          if (operation === 'invoke') {
            expect(span.data[getSpanName(operation)].function).to.equal(functionName);
            expect(span.data[getSpanName(operation)].type).to.equal(
              span.data[getSpanName(operation)].type ? 'RequestResponse' : undefined
            );
          } else if (operation === 'listBuckets') {
            expect(span.data.s3.op).to.exist;
          } else if (operation === 'listTables') {
            expect(span.data.dynamodb.op).to.equal('list');
          } else if (operation === 'listStreams') {
            expect(span.data.kinesis.op).to.equal('listStreams');
          }
        }
      ]);
    }
  });

  describe('tracing disabled', () => {
    this.timeout(config.getTestTimeout() * 2);
    const appControls = new ProcessControls({
      appPath: path.join(__dirname, 'combined_products'),
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
        const requestMethod = getMethodRoundRobin();
        it(`should not trace ${operation}/${requestMethod}`, async () => {
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
      appPath: path.join(__dirname, 'combined_products'),
      port: 3215,
      useGlobalAgent: true,
      env: {
        AWS_LAMBDA_FUNCTION_NAME: functionName
      }
    });
    ProcessControls.setUpHooksWithRetryTime(retryTime, appControls);
    describe('attempt to get result', () => {
      availableOperations.forEach(operation => {
        const requestMethod = getMethodRoundRobin();
        it(`should not trace ${operation}/${requestMethod}`, async () => {
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
