/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const { v4: uuid } = require('uuid');
const semver = require('semver');
const { expect } = require('chai');
const path = require('path');
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
const withErrorOptions = [true, false];

const operationsInfo = {
  deleteStream: 'deleteStream',
  createStream: 'createStream',
  getRecords: 'getRecords',
  getShardIterator: 'getShardIterator',
  listStreams: 'listStreams',
  putRecord: 'putRecord',
  putRecords: 'putRecords'
};

const requestMethods = ['async', 'promise', 'cb', 'async-v2', 'promise-v2', 'cb-v2'];
const availableOperations = [
  'createStream',
  'putRecords',
  'putRecord',
  'listStreams',
  'getRecords',
  'getShardIterator'
];

const getNextCallMethod = require('@instana/core/test/test_util/circular_list').getCircularList(requestMethods);
function start(version) {
  let mochaSuiteFn;
  if (!supportedVersion(process.versions.node) || semver.lt(process.versions.node, '14.0.0')) {
    mochaSuiteFn = describe.skip;
    return;
  } else {
    mochaSuiteFn = describe;
  }

  const { cleanup } = require('./util');
  const { checkStreamExistence } = require('./util');

  mochaSuiteFn(`npm: ${version}`, function () {
    this.timeout(config.getTestTimeout() * 10);

    globalAgent.setUpCleanUpHooks();
    const agentControls = globalAgent.instance;

    after(() => cleanup(streamName));

    describe('tracing enabled, no suppression', function () {
      const appControls = new ProcessControls({
        appPath: path.join(__dirname, 'app'),
        useGlobalAgent: true,
        env: {
          AWS_KINESIS_STREAM_NAME: streamName
        }
      });

      ProcessControls.setUpHooks(appControls);

      withErrorOptions.forEach(withError => {
        if (withError) {
          const operations = availableOperations.filter(op => op !== 'listStreams');
          describe(`getting result with error: ${withError ? 'yes' : 'no'}`, () => {
            it(`should instrument ${operations.join(', ')} with error`, () =>
              promisifyNonSequentialCases(verify, operations, appControls, withError, getNextCallMethod));
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
            span =>
              expect(span.data.kinesis.op).to.equal(
                withError && operationsInfo[operation].match(/^getRecords$|^getShardIterator$/)
                  ? 'listShards'
                  : operationsInfo[operation]
              ),
            span =>
              expect(span.data.kinesis.stream).to.equal(
                !span.data.kinesis.op.match(/^getRecords$|^listStreams$/) ? streamName : undefined
              ),
            span => {
              if (span.data.kinesis.op === 'getShardIterator') {
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
        useGlobalAgent: true,
        tracingEnabled: false,
        env: {
          AWS_KINESIS_STREAM_NAME: streamName
        }
      });

      ProcessControls.setUpHooks(appControls);

      describe('attempt to get result', () => {
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
      const appControls = new ProcessControls({
        appPath: path.join(__dirname, 'app'),
        useGlobalAgent: true,
        env: {
          AWS_KINESIS_STREAM_NAME: streamName
        }
      });

      ProcessControls.setUpHooks(appControls);

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
}
module.exports = function (version) {
  return start.bind(this)(version);
};
