/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const { v4: uuid } = require('uuid');
const semver = require('semver');
const path = require('path');
const { expect } = require('chai');
const { cleanup } = require('./util');
const { fail } = expect;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../../../core/test/config');
const { retry, stringifyItems, delay } = require('../../../../../../../core/test/test_util');
const ProcessControls = require('../../../../../test_util/ProcessControls');
const globalAgent = require('../../../../../globalAgent');
const {
  verifyHttpRootEntry,
  verifyHttpExit,
  verifyExitSpan
} = require('@instana/core/test/test_util/common_verifications');
const { promisifyNonSequentialCases } = require('../promisify_non_sequential');

let bucketName = 'nodejs-team';

if (process.env.AWS_S3_BUCKET_NAME) {
  bucketName = `${process.env.AWS_S3_BUCKET_NAME}${semver.major(process.versions.node)}-${uuid()}`;
}

const randomNumber = Math.floor(Math.random() * 1000);
bucketName = `${bucketName}-${randomNumber}`;

let mochaSuiteFn;

const withErrorOptions = [false, true];

const requestMethods = ['Callback', 'Async'];
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

const getNextCallMethod = require('@instana/core/test/test_util/circular_list').getCircularList(requestMethods);

if (!supportedVersion(process.versions.node)) {
  mochaSuiteFn = describe.skip;
} else {
  mochaSuiteFn = describe;
}

const retryTime = config.getTestTimeout() * 2;

mochaSuiteFn('tracing/cloud/aws-sdk/v2/s3', function () {
  this.timeout(config.getTestTimeout() * 3);

  after(() => cleanup(bucketName));

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  describe('tracing enabled, no suppression', function () {
    const appControls = new ProcessControls({
      appPath: path.join(__dirname, 'app'),
      port: 3215,
      useGlobalAgent: true,
      env: {
        AWS_S3_BUCKET_NAME: bucketName
      }
    });

    ProcessControls.setUpHooksWithRetryTime(retryTime, appControls);

    withErrorOptions.forEach(withError => {
      if (withError) {
        describe(`getting result with error: ${withError ? 'yes' : 'no'}`, () => {
          it(`should instrument ${availableOperations.join(', ')} with error`, () =>
            promisifyNonSequentialCases(verify, availableOperations, appControls, withError, getNextCallMethod));
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

              return verify(appControls, response, apiPath, withError);
            });
          });
        });
      }
    });

    function verify(controls, response, apiPath, withError) {
      return retry(
        () => agentControls.getSpans().then(spans => verifySpans(controls, spans, apiPath, withError)),
        retryTime
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
  });

  describe('tracing disabled', () => {
    this.timeout(config.getTestTimeout() * 2);

    const appControls = new ProcessControls({
      appPath: path.join(__dirname, 'app'),
      port: 3215,
      useGlobalAgent: true,
      tracingEnabled: false,
      env: {
        AWS_S3_BUCKET_NAME: bucketName
      }
    });

    ProcessControls.setUpHooksWithRetryTime(retryTime, appControls);

    describe('attempt to get result', () => {
      // we don't want to create the bucket, cause it already exists, and also don't want to delete it
      availableOperations.slice(1, -1).forEach(operation => {
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
                fail(`Unexpected spans (AWS S3 suppressed: ${stringifyItems(spans)}`);
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
        AWS_S3_BUCKET_NAME: bucketName
      }
    });

    ProcessControls.setUpHooksWithRetryTime(retryTime, appControls);

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

          return retry(() => delay(config.getTestTimeout() / 4), retryTime)
            .then(() => agentControls.getSpans())
            .then(spans => {
              if (spans.length > 0) {
                fail(`Unexpected spans (AWS S3 suppressed: ${stringifyItems(spans)}`);
              }
            });
        });
      });
    });
  });
});
