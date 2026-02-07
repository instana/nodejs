/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const { v4: uuid } = require('uuid');
const semver = require('semver');
const path = require('path');
const { expect } = require('chai');
const { fail } = expect;
const supportedVersion = require('@_local/core').tracing.supportedVersion;
const config = require('../../../../../../../core/test/config');
const { retry, stringifyItems, delay } = require('../../../../../../../core/test/test_util');
const ProcessControls = require('../../../../../test_util/ProcessControls');
const globalAgent = require('../../../../../globalAgent');
const {
  verifyHttpRootEntry,
  verifyHttpExit,
  verifyExitSpan
} = require('@_local/core/test/test_util/common_verifications');
const { promisifyNonSequentialCases } = require('../promisify_non_sequential');
const cleanup = require('./util').cleanup;
const withErrorOptions = [false, true];

const requestMethods = ['v3', 'v2', 'cb'];
const availableOperations = [
  'createBucket',
  'putObject',
  'listBuckets',
  'listObjects',
  'listObjectsV2',
  'headObject',
  'getObject',
  'deleteObject',
  'deleteBucket'
];

const getNextCallMethod = require('@_local/core/test/test_util/circular_list').getCircularList(requestMethods);

function start(version) {
  const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

  mochaSuiteFn(`npm: ${version}`, function () {
    this.timeout(config.getTestTimeout() * 3);

    const bucketPrefix = 'nodejs-team';
    const bucketName = `${bucketPrefix}-v2-${semver.major(process.versions.node)}-${uuid()}-${Math.floor(
      Math.random() * 1000
    )}`;

    after(() => cleanup(bucketName));

    globalAgent.setUpCleanUpHooks();
    const agentControls = globalAgent.instance;

    describe('tracing enabled, no suppression', function () {
      let appControls;

      before(async () => {
        appControls = new ProcessControls({
          appPath: path.join(__dirname, 'app'),
          useGlobalAgent: true,
          env: {
            AWS_S3_BUCKET_NAME: bucketName,
            AWS_SDK_CLIENT_S3_REQUIRE: version
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
        if (withError) {
          const operationsWithoutListBuckets = availableOperations.filter(op => op !== 'listBuckets');
          describe(`getting result with error: ${withError ? 'yes' : 'no'}`, () => {
            it(`should instrument ${operationsWithoutListBuckets.join(', ')} with error`, () =>
              promisifyNonSequentialCases(
                verify,
                operationsWithoutListBuckets,
                appControls,
                withError,
                getNextCallMethod
              ));
          });
        } else {
          describe(`getting result with error: ${withError ? 'yes' : 'no'}`, () => {
            // we don't want to delete the bucket at the end
            availableOperations.slice(0, -1).forEach(operation => {
              const requestMethod = getNextCallMethod();
              it(`operation: ${operation}/${requestMethod}`, async () => {
                const withErrorOption = withError ? '?withError=1' : '';
                const apiPath = `/${operation}/${requestMethod}`;

                const response = await appControls.sendRequest({
                  method: 'GET',
                  path: `${apiPath}${withErrorOption}`,
                  simple: withError === false
                });

                return verify(appControls, response, apiPath, withError, operation);
              });
            });
          });
        }
      });

      function verify(controls, response, apiPath, withError, operation) {
        verifyResponse(response, operation, withError);
        return retry(
          () => agentControls.getSpans().then(spans => verifySpans(controls, spans, apiPath, withError)),
          1000
        );
      }

      function verifySpans(controls, spans, apiPath, withError) {
        const httpEntry = verifyHttpRootEntry({ spans, apiPath, pid: String(controls.getPid()) });
        verifyExitSpan({
          spanName: 's3',
          spans,
          parent: httpEntry,
          withError,
          pid: String(controls.getPid()),
          extraTests: [span => expect(span.data.s3.op).to.exist]
        });

        if (!withError) {
          verifyHttpExit({ spans, parent: httpEntry, pid: String(controls.getPid()) });
        }
      }

      function verifyResponse(response, operation, withError) {
        expect(response).to.exist;
        if (!withError && response.error) throw new Error(response.error);

        if (!withError) {
          if (operation === 'createBucket') {
            expect(response.result.$metadata).to.exist;
            expect(response.result.Location).to.exist;
          }
          if (operation === 'getObject') {
            expect(response.result).to.equal('some body');
          }
          if (operation === 'putObject') {
            expect(response.result.$metadata).to.exist;
            expect(response.result.ETag).to.exist;
          }
          if (operation === 'deleteObject') {
            expect(response.result.$metadata).to.exist;
          }
          if (operation === 'headObject') {
            expect(response.result.$metadata).to.exist;
            expect(response.result.AcceptRanges).to.exist;
            expect(response.result.ETag).to.exist;
          }
          if (operation === 'listObjects' || operation === 'listObjectsV2') {
            expect(response.result.$metadata).to.exist;
            expect(response.result.Contents).to.exist;
            expect(response.result.MaxKeys).to.exist;
          }
          if (operation === 'listBuckets') {
            expect(response.result.$metadata).to.exist;
            expect(response.result.Buckets).to.exist;
            expect(response.result.Owner).to.exist;
            expect(response.result.Owner.ID).to.exist;
            expect(response.result.Buckets.length).to.gte(0);
          }
        }
      }
    });

    describe('tracing disabled', () => {
      this.timeout(config.getTestTimeout() * 2);
      let appControls;

      before(async () => {
        appControls = new ProcessControls({
          appPath: path.join(__dirname, 'app'),
          useGlobalAgent: true,
          tracingEnabled: false,
          env: {
            AWS_S3_BUCKET_NAME: bucketName,
            AWS_SDK_CLIENT_S3_REQUIRE: version
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
        // we don't want to create the bucket, cause it already exists, and also don't want to delete it
        availableOperations.slice(1, -1).forEach(operation => {
          const requestMethod = getNextCallMethod();
          it(`should not trace (${operation}/${requestMethod})`, async () => {
            await appControls.sendRequest({
              method: 'GET',
              path: `/${operation}/${requestMethod}`
            });

            await delay(1000);
            const spans = await agentControls.getSpans();
            if (spans.length > 0) {
              fail(`Unexpected spans: ${stringifyItems(spans)}`);
            }
          });
        });
      });
    });

    describe('tracing enabled but suppressed', () => {
      let appControls;

      before(async () => {
        appControls = new ProcessControls({
          appPath: path.join(__dirname, 'app'),
          useGlobalAgent: true,
          env: {
            AWS_S3_BUCKET_NAME: bucketName,
            AWS_SDK_CLIENT_S3_REQUIRE: version
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
        // we don't want to create the bucket, cause it already exists, and also don't want to delete it
        availableOperations.slice(1, -1).forEach(operation => {
          const requestMethod = getNextCallMethod();
          it(`should not trace (${operation}/${requestMethod})`, async () => {
            await appControls.sendRequest({
              suppressTracing: true,
              method: 'GET',
              path: `/${operation}/${requestMethod}`
            });

            await delay(1000);
            const spans = await agentControls.getSpans();
            if (spans.length > 0) {
              fail(`Unexpected spans: ${stringifyItems(spans)}`);
            }
          });
        });
      });
    });
  });
}

module.exports = function (version) {
  return start.bind(this)(version);
};
