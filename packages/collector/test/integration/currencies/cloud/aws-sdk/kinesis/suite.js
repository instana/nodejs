/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const { v4: uuid } = require('uuid');
const { cleanup, checkStreamExistence } = require('./util');
const semver = require('semver');
const { expect } = require('chai');
const { fail } = expect;
const supportedVersion = require('@_local/core').tracing.supportedVersion;
const config = require('@_local/core/test/config');
const { retry, stringifyItems, delay } = require('@_local/core/test/test_util');
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');
const globalAgent = require('@_local/collector/test/globalAgent');
const {
  verifyHttpRootEntry,
  verifyExitSpan,
  verifyHttpExit
} = require('@_local/core/test/test_util/common_verifications');
const { promisifyNonSequentialCases } = require('../promisify_non_sequential');

const streamPrefix = 'nodejs-team';
const streamName = `${streamPrefix}-v2-${semver.major(process.versions.node)}-${uuid()}`;

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

const getNextCallMethod = require('@_local/core/test/test_util/circular_list').getCircularList(requestMethods);

const esmLoaderPath = path.join(__dirname, '..', 'node_modules', '@instana', 'collector', 'esm-register.mjs');
const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

module.exports = function (libraryEnv) {
  mochaSuiteFn('tracing/cloud/aws-sdk/v2/kinesis', function () {
    this.timeout(config.getTestTimeout() * 10);

    globalAgent.setUpCleanUpHooks();
    const agentControls = globalAgent.instance;

    after(() => cleanup(streamName));

    describe('tracing enabled, no suppression', function () {
      let appControls;

      before(async () => {
        appControls = new ProcessControls({
          dirname: __dirname,
          useGlobalAgent: true,
          esmLoaderPath,
          env: {
            AWS_KINESIS_STREAM_NAME: streamName,
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
          1000
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

      let appControls;

      before(async () => {
        appControls = new ProcessControls({
          dirname: __dirname,
          useGlobalAgent: true,
          tracingEnabled: false,
          esmLoaderPath,
          env: {
            AWS_KINESIS_STREAM_NAME: streamName,
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
          dirname: __dirname,
          useGlobalAgent: true,
          esmLoaderPath,
          env: {
            AWS_KINESIS_STREAM_NAME: streamName,
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
};
