/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const path = require('path');
const { expect } = require('chai');
const { fail } = expect;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const { retry, stringifyItems, delay } = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');
const { verifyHttpRootEntry, verifyExitSpan } = require('@instana/core/test/test_util/common_verifications');
const { promisifyNonSequentialCases } = require('./promisify_non_sequential');

const functionName = 'team-nodejs-invoke-function';
let mochaSuiteFn;

const withErrorOptions = [false, true];
const requestMethods = ['Callback', 'Promise', 'Async'];
const availableOperations = ['invoke', 'listBuckets', 'listTables', 'listStreams'];

const getNextCallMethod = require('@instana/core/test/test_util/circular_list').getCircularList(requestMethods);

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
      describe(`getting result with error: ${withError ? 'yes' : 'no'}`, () => {
        it(`should instrument ${availableOperations.join(', ')} ${withError ? 'with' : 'without'} errors`, () => {
          return promisifyNonSequentialCases(verify, availableOperations, appControls, withError, getNextCallMethod);
        });
      });
    });
    function verify(controls, response, apiPath, operation, withError) {
      return retry(() => {
        return agentControls.getSpans().then(spans => verifySpans(controls, spans, apiPath, operation, withError));
      }, retryTime);
    }
    function verifySpans(controls, spans, apiPath, operation, withError) {
      const httpEntry = verifyHttpRootEntry({ spans, apiPath, pid: String(controls.getPid()) });
      verifyExitSpan({
        spanName: getSpanName(operation),
        spans,
        parent: httpEntry,
        withError,
        pid: String(appControls.getPid()),
        extraTests: [
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
        ]
      });
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
      it(`should not trace ${availableOperations.join(', ')}`, () => {
        return promisifyNonSequentialCases(
          () => {
            return retry(() => delay(config.getTestTimeout() / 4))
              .then(() => agentControls.getSpans())
              .then(spans => {
                if (spans.length > 0) {
                  fail(`Unexpected spans suppressed: ${stringifyItems(spans)}`);
                }
              });
          },
          availableOperations,
          appControls,
          false,
          getNextCallMethod
        );
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
      it(`should not trace ${availableOperations.join(', ')}`, () => {
        return promisifyNonSequentialCases(
          () => {
            return retry(() => delay(config.getTestTimeout() / 4), retryTime)
              .then(() => agentControls.getSpans())
              .then(spans => {
                if (spans.length > 0) {
                  fail(`Unexpected spans suppressed: ${stringifyItems(spans)}`);
                }
              });
          },
          availableOperations,
          appControls,
          false,
          getNextCallMethod,
          { suppressTracing: true }
        );
      });
    });
  });
});
