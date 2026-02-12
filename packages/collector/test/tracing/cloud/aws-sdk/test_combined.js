/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

module.exports = function (libraryEnv) {
const { expect } = require('chai');
const { fail } = expect;
const supportedVersion = require('@_local/core').tracing.supportedVersion;
const config = require('@_local/core/test/config');
const { retry, stringifyItems, delay } = require('@_local/core/test/test_util');
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');
const globalAgent = require('@_local/collector/test/globalAgent');
const { verifyHttpRootEntry, verifyExitSpan } = require('@_local/core/test/test_util/common_verifications');
const { promisifyNonSequentialCases } = require('./promisify_non_sequential');

// We are using a single function, 'nodejs-tracer-lambda', for our Lambda testing since we invoke an existing function.
// Our tests focus on invoking function and retrieving details of the function, rather than creating new ones.
// We originally created this function specifically for testing and are now using it across all test cases.
const functionName = 'nodejs-tracer-lambda';
let mochaSuiteFn;

const withErrorOptions = [false, true];
const requestMethods = ['Callback', 'Promise', 'Async'];
const availableOperations = ['invoke', 'listBuckets', 'listTables', 'listStreams'];

const getNextCallMethod = require('@_local/core/test/test_util/circular_list').getCircularList(requestMethods);

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

mochaSuiteFn('tracing/cloud/aws-sdk/v2/combined-products', function () {
  this.timeout(config.getTestTimeout() * 3);
  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  describe('tracing enabled, no suppression', function () {
    let appControls;

    before(async () => {
      appControls = new ProcessControls({
        dirname: __dirname,
        appName: 'combined_products.js',
        useGlobalAgent: true,
        env: {
          AWS_LAMBDA_FUNCTION_NAME: functionName,
          ...libraryEnv
        }
      });

      await appControls.startAndWaitForAgentConnection();
    });

    beforeEach(async () => {
      await agentControls.clearReceivedTraceData();
    });

    after(async () => {
      await appControls.stop();
    });

    afterEach(async () => {
      await appControls.clearIpcMessages();
    });

    withErrorOptions.forEach(withError => {
      describe(`getting result with error: ${withError ? 'yes' : 'no'}`, () => {
        it(`should instrument ${availableOperations.join(', ')} ${withError ? 'with' : 'without'} errors`, () =>
          promisifyNonSequentialCases(verify, availableOperations, appControls, withError, getNextCallMethod));
      });
    });

    function verify(controls, response, apiPath, operation, withError) {
      return retry(
        () => agentControls.getSpans().then(spans => verifySpans(controls, spans, apiPath, operation, withError)),
        1000
      );
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

    let appControls;

    before(async () => {
      appControls = new ProcessControls({
        dirname: __dirname,
        appName: 'combined_products.js',
        useGlobalAgent: true,
        tracingEnabled: false,
        env: {
          AWS_LAMBDA_FUNCTION_NAME: functionName,
          ...libraryEnv
        }
      });

      await appControls.startAndWaitForAgentConnection();
    });

    beforeEach(async () => {
      await agentControls.clearReceivedTraceData();
    });

    after(async () => {
      await appControls.stop();
    });

    afterEach(async () => {
      await appControls.clearIpcMessages();
    });

    describe('attempt to get result', () => {
      it(`should not trace ${availableOperations.join(', ')}`, () =>
        promisifyNonSequentialCases(
          async () => {
            await delay(1000);
            const spans = await agentControls.getSpans();
            if (spans.length > 0) {
              fail(`Unexpected spans suppressed: ${stringifyItems(spans)}`);
            }
          },
          availableOperations,
          appControls,
          false,
          getNextCallMethod
        ));
    });
  });

  describe('tracing enabled but suppressed', () => {
    let appControls;

    before(async () => {
      appControls = new ProcessControls({
        dirname: __dirname,
        appName: 'combined_products.js',
        useGlobalAgent: true,
        env: {
          AWS_LAMBDA_FUNCTION_NAME: functionName,
          ...libraryEnv
        }
      });

      await appControls.startAndWaitForAgentConnection();
    });

    beforeEach(async () => {
      await agentControls.clearReceivedTraceData();
    });

    after(async () => {
      await appControls.stop();
    });

    afterEach(async () => {
      await appControls.clearIpcMessages();
    });

    describe('attempt to get result', () => {
      it(`should not trace ${availableOperations.join(', ')}`, () =>
        promisifyNonSequentialCases(
          async () => {
            await delay(1000);
            const spans = await agentControls.getSpans();
            if (spans.length > 0) {
              fail(`Unexpected spans suppressed: ${stringifyItems(spans)}`);
            }
          },
          availableOperations,
          appControls,
          false,
          getNextCallMethod,
          { suppressTracing: true }
        ));
    });
  });
});
};
