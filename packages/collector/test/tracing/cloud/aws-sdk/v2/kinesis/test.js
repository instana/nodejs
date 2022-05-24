/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const { v4: uuid } = require('uuid');
const { cleanup, checkStreamExistence } = require('./util');
const semver = require('semver');
const path = require('path');
const { expect } = require('chai');
const { fail } = expect;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../../../core/test/config');
const { retry, stringifyItems, delay } = require('../../../../../../../core/test/test_util');
const ProcessControls = require('../../../../../test_util/ProcessControls');
const globalAgent = require('../../../../../globalAgent');
const {
  verifyHttpRootEntry,
  verifyExitSpan,
  verifyHttpExit
} = require('@instana/core/test/test_util/common_verifications');
const { promisifyNonSequentialCases } = require('../promisify_non_sequential');

let streamName = process.env.AWS_KINESIS_STREAM_NAME || 'nodejs-team';

if (process.env.AWS_KINESIS_STREAM_NAME) {
  streamName = `${process.env.AWS_KINESIS_STREAM_NAME}${semver.major(process.versions.node)}-${uuid()}`;
}

let mochaSuiteFn;

const operationsInfo = {
  deleteStream: 'deleteStream',
  createStream: 'createStream',
  getRecords: 'getRecords',
  getShardIterator: 'shardIterator',
  listStreams: 'listStreams',
  putRecord: 'putRecord',
  putRecords: 'putRecords'
};

const withErrorOptions = [false, true];

const requestMethods = ['Callback', 'Promise'];
const availableOperations = [
  'createStream',
  'putRecords',
  'putRecord',
  'listStreams',
  'getRecords',
  'getShardIterator'
];

const getNextCallMethod = require('@instana/core/test/test_util/circular_list').getCircularList(requestMethods);

if (!supportedVersion(process.versions.node)) {
  mochaSuiteFn = describe.skip;
} else {
  mochaSuiteFn = describe;
}

const retryTime = config.getTestTimeout() * 2;

mochaSuiteFn('tracing/cloud/aws-sdk/v2/kinesis', function () {
  this.timeout(config.getTestTimeout() * 3);

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  after(() => cleanup(streamName));

  describe('tracing enabled, no suppression', function () {
    const appControls = new ProcessControls({
      appPath: path.join(__dirname, 'app'),
      port: 3215,
      useGlobalAgent: true,
      env: {
        AWS_KINESIS_STREAM_NAME: streamName
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
          availableOperations.forEach(operation => {
            const requestMethod = getNextCallMethod();
            it(`operation: ${operation}/${requestMethod}`, async () => {
              const withErrorOption = withError ? '?withError=1' : '';
              const apiPath = `/${operation}/${requestMethod}`;

              const response = await appControls.sendRequest({
                method: 'GET',
                path: `${apiPath}${withErrorOption}`,
                simple: withError === false
              });

              /**
               * The stream takes some time to be available, even though the callback gives a success message
               */
              if (operation === 'createStream') {
                await checkStreamExistence(streamName, true);
              }

              return verify(appControls, response, apiPath, operation, withError);
            });
          });
        });
      }
    });

    function verify(controls, response, apiPath, operation, withError) {
      return retry(
        () => agentControls.getSpans().then(spans => verifySpans(controls, spans, apiPath, operation, withError)),
        retryTime
      );
    }

    function verifySpans(controls, spans, apiPath, operation, withError) {
      const httpEntry = verifyHttpRootEntry({ spans, apiPath, pid: String(controls.getPid()) });
      verifyExitSpan({
        spanName: 'kinesis',
        spans,
        parent: httpEntry,
        withError,
        pid: String(controls.getPid()),
        extraTests: [
          // When we force an error into getRecords or getShardIterator, the error will occur in listShards
          // before even reaching getRecords
          span =>
            expect(span.data.kinesis.op).to.equal(
              withError && operationsInfo[operation].match(/^getRecords$|^shardIterator$/)
                ? 'listShards'
                : operationsInfo[operation]
            ),
          span =>
            expect(span.data.kinesis.stream).to.equal(
              !span.data.kinesis.op.match(/^getRecords$|^listStreams$/) ? streamName : undefined
            ),
          span => {
            if (span.data.kinesis.op === 'shardIterator') {
              expect(span.data.kinesis.shard).to.equal('shardId-000000000000');
              expect(span.data.kinesis.shardType).to.equal('AT_SEQUENCE_NUMBER');
              expect(span.data.kinesis.startSequenceNumber).to.exist;
            }
          }
        ]
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
        AWS_KINESIS_STREAM_NAME: streamName
      }
    });

    ProcessControls.setUpHooksWithRetryTime(retryTime, appControls);

    describe('attempt to get result', () => {
      // we don't create the stream, as it was created previously
      availableOperations.slice(1).forEach(operation => {
        const requestMethod = getNextCallMethod();
        it(`should not trace (${operation}/${requestMethod})`, async () => {
          await appControls.sendRequest({
            method: 'GET',
            path: `/${operation}/${requestMethod}`
          });

          if (operation === 'createStream') {
            await checkStreamExistence(streamName, true);
          }

          if (operation === 'deleteStream') {
            await checkStreamExistence(streamName, false);
          }

          return retry(() => delay(config.getTestTimeout() / 4))
            .then(() => agentControls.getSpans())
            .then(spans => {
              if (spans.length > 0) {
                fail(`Unexpected spans (AWS Kinesis suppressed: ${stringifyItems(spans)}`);
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
        AWS_KINESIS_STREAM_NAME: streamName
      }
    });

    ProcessControls.setUpHooksWithRetryTime(retryTime, appControls);

    describe('attempt to get result', () => {
      // we don't create the stream, as it was created previously
      availableOperations.slice(1).forEach(operation => {
        const requestMethod = getNextCallMethod();
        it(`should not trace (${operation}/${requestMethod})`, async () => {
          await appControls.sendRequest({
            suppressTracing: true,
            method: 'GET',
            path: `/${operation}/${requestMethod}`
          });

          if (operation === 'createStream') {
            await checkStreamExistence(streamName, true);
          }

          if (operation === 'deleteStream') {
            await checkStreamExistence(streamName, false);
          }

          return retry(() => delay(config.getTestTimeout() / 4), retryTime)
            .then(() => agentControls.getSpans())
            .then(spans => {
              if (spans.length > 0) {
                fail(`Unexpected spans (AWS Kinesis suppressed: ${stringifyItems(spans)}`);
              }
            });
        });
      });
    });
  });
});
