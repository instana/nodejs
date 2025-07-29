/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const { v4: uuid } = require('uuid');
const expect = require('chai').expect;
const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../../core/test/config');
const {
  verifyHttpRootEntry,
  expectExactlyNMatching,
  stringifyItems,
  retry,
  delay
} = require('../../../../../../core/test/test_util');
const ProcessControls = require('../../../../test_util/ProcessControls');
const globalAgent = require('../../../../globalAgent');
const { fail } = expect;
const { createContainer, deleteContainer } = require('./util');
const { BlobServiceClient } = require('@azure/storage-blob');
const expectExactlyOneMatching = require('@instana/core/test/test_util/expectExactlyOneMatching');
const containerName = `nodejs-team-${uuid()}`;
const storageAccount = process.env.AZURE_STORAGE_ACCOUNT_NAME;
const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;

/**
 * refer for azure connection-string and its components:
 * https://learn.microsoft.com/en-us/azure/storage/common/storage-configure-connection-string
 */
const endPoint = 'EndpointSuffix=core.windows.net';
const connStr = `DefaultEndpointsProtocol=https;AccountName=${storageAccount};AccountKey=${accountKey};${endPoint}`;
const blobServiceClient = BlobServiceClient.fromConnectionString(connStr);
const containerClient = blobServiceClient.getContainerClient(containerName);

let mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

/**
 * This suite is skipped if no storage account or account key has been provided via AZURE_STORAGE_ACCOUNT_NAME
 * and AZURE_STORAGE_ACCOUNT_KEY. For Azure Blob tests, the Azure storage account used is 'nodejstracerteam',
 * specified in AZURE_STORAGE_ACCOUNT_NAME. Retrieve the account key from the Azure portal by navigating
 * to the 'Security + Networking' section of the 'nodejstracerteam' storage account and locating the Access keys.
 * Alternatively, find the key in 1password by searching for "Team Node.js: Azure Blob credentials" and set it.
 * export AZURE_STORAGE_ACCOUNT_NAME=nodejstracerteam
 * export AZURE_STORAGE_ACCOUNT_KEY=<key>
 */

if (!storageAccount || !accountKey) {
  describe('tracing/cloud/azure/blob', function () {
    it('The configuration for Azure is missing', () => {
      fail('Please set process.env.AZURE_STORAGE_ACCOUNT_KEY and process.env.AZURE_STORAGE_ACCOUNT_NAME before tests.');
    });
  });
} else {
  ['latest', 'v1227'].forEach(version => {
    mochaSuiteFn('tracing/cloud/azure/blob', function () {
      // NOTE: require-mock is not working with ESM apps.
      // TODO: Support for mocking `import` in ESM apps is planned under INSTA-788.
      if (process.env.RUN_ESM && version !== 'latest') return;

      // @azure/storage-blob v12.28.0 supports Node.js v20.0.0 and later.
      if (version === 'latest' && process.versions.node < '20.0.0') {
        mochaSuiteFn = describe.skip;
      }

      this.timeout(config.getTestTimeout());
      globalAgent.setUpCleanUpHooks();
      const agentControls = globalAgent.instance;

      before(async () => {
        await createContainer(containerClient);
      });

      after(async () => {
        await deleteContainer(containerClient);
      });
      mochaSuiteFn(`@azure/storage-blob@${version}`, function () {
        describe('tracing enabled', function () {
          let controls;
          before(async () => {
            controls = new ProcessControls({
              dirname: __dirname,
              useGlobalAgent: true,
              env: {
                AZURE_CONTAINER_NAME: containerName,
                AZURE_CONNECTION_STRING: connStr,
                AZURE_STORAGE_ACCOUNT: storageAccount,
                AZURE_ACCOUNT_KEY: accountKey,
                AZURE_BLOB_VERSION: version
              }
            });

            await controls.startAndWaitForAgentConnection();
          });

          beforeEach(async () => {
            await agentControls.clearReceivedTraceData();
          });

          after(async () => {
            await controls.stop();
          });

          afterEach(async () => {
            await controls.clearIpcMessages();
          });

          it('uploads block data', async () => {
            await controls.sendRequest({
              method: 'GET',
              path: '/uploadDataBlock'
            });
            await retry(async () => {
              const spans = await agentControls.getSpans();
              await verify({
                spanName: 'azstorage',
                dataProperty: 'azstorage',
                path: '/uploadDataBlock',
                withError: false,
                spans: spans,
                op: 'upload',
                totalspans: 3 // expects 1 azure upload span and 2 http spans
              });
            });
          });

          it('upload - promise', async () => {
            await controls.sendRequest({
              method: 'GET',
              path: '/upload'
            });
            await retry(async () => {
              const spans = await agentControls.getSpans();
              await verify({
                spanName: 'azstorage',
                dataProperty: 'azstorage',
                path: '/upload',
                withError: false,
                spans: spans,
                op: 'upload',
                totalspans: 4 // expects 1 azure upload span, 1 fs span of otel and 2 http spans
              });
            });
          });

          it('upload - err', async () => {
            await controls.sendRequest({
              method: 'GET',
              path: '/upload-err'
            });
            await retry(async () => {
              const spans = await agentControls.getSpans();
              await verify({
                spanName: 'azstorage',
                dataProperty: 'azstorage',
                path: '/upload-err',
                withError: true,
                spans: spans,
                op: 'upload',
                totalspans: 3 // expects 1 azure upload span, 1 fs span of otel and 1 http span
              });
            });
          });

          it('uploadData and delete', async () => {
            await controls.sendRequest({
              method: 'GET',
              path: '/uploadData'
            });
            await retry(async () => {
              const spans = await agentControls.getSpans();
              await verify({
                spanName: 'azstorage',
                dataProperty: 'azstorage',
                path: '/uploadData',
                withError: false,
                spans: spans,
                op: 'upload',
                totalspans: 3 // expects 1 azure upload span, 1 azure delete span and 1 http span
              });
            });
          });

          it('Error in delete-promise', async () => {
            await controls.sendRequest({
              method: 'GET',
              path: '/deleteError'
            });
            await retry(async () => {
              const spans = await agentControls.getSpans();
              await verify({
                spanName: 'azstorage',
                dataProperty: 'azstorage',
                path: '/deleteError',
                withError: true,
                spans: spans,
                op: 'delete',
                totalspans: 2 // expects 1 azure delete span and 1 http span
              });
            });
          });

          it('uploadData-delete-blobBatch-blobUri', async () => {
            await controls.sendRequest({
              method: 'GET',
              path: '/uploadData-delete-blobBatch-blobUri'
            });
            await retry(async () => {
              const spans = await agentControls.getSpans();
              await verify({
                spanName: 'azstorage',
                dataProperty: 'azstorage',
                path: '/uploadData-delete-blobBatch-blobUri',
                withError: false,
                spans: spans,
                op: 'delete',
                totalspans: 4 // expects 1 azure delete span, 1 azure upload span and 2 http span
              });
            });
          });

          it('uploadData-delete-blobBatch-blobClient', async () => {
            await controls.sendRequest({
              method: 'GET',
              path: '/uploadData-delete-blobBatch-blobClient'
            });
            await retry(async () => {
              const spans = await agentControls.getSpans();
              await verify({
                spanName: 'azstorage',
                dataProperty: 'azstorage',
                path: '/uploadData-delete-blobBatch-blobClient',
                withError: false,
                spans: spans,
                op: 'delete',
                totalspans: 4 // expects 1 azure delete span, 1 azure upload span and 2 http span
              });
            });
          });

          it('download-await', async () => {
            await controls.sendRequest({
              method: 'GET',
              path: '/download-await'
            });
            await retry(async () => {
              const spans = await agentControls.getSpans();
              await verify({
                spanName: 'azstorage',
                dataProperty: 'azstorage',
                path: '/download-await',
                withError: false,
                spans: spans,
                op: 'download',
                totalspans: 4 // expects 1 azure delete span, 1 azure upload span, 1 azure download span and 1 http span
              });
            });
          });

          it('download', async () => {
            await controls.sendRequest({
              method: 'GET',
              path: '/download'
            });
            await retry(async () => {
              const spans = await agentControls.getSpans();
              await verify({
                spanName: 'azstorage',
                dataProperty: 'azstorage',
                path: '/download',
                withError: false,
                spans: spans,
                op: 'download',
                totalspans: 6 // expects 3 azure spans( delete, upload, download ), 2 fs spans and 1 http span
              });
            });
          });

          it('download to buffer', async () => {
            await controls.sendRequest({
              method: 'GET',
              path: '/download-buffer'
            });
            await retry(async () => {
              const spans = await agentControls.getSpans();
              await verify({
                spanName: 'azstorage',
                dataProperty: 'azstorage',
                path: '/download-buffer',
                withError: false,
                spans: spans,
                op: 'download',
                totalspans: 7 // expects 3 azure spans( delete, upload, download ), 2 fs spans and 2 http spans
              });
            });
          });

          it('download to buffer-promise', async () => {
            await controls.sendRequest({
              method: 'GET',
              path: '/download-buffer-promise'
            });
            await retry(async () => {
              const spans = await agentControls.getSpans();
              await verify({
                spanName: 'azstorage',
                dataProperty: 'azstorage',
                path: '/download-buffer-promise',
                withError: false,
                spans: spans,
                op: 'download',
                totalspans: 7 // expects 3 azure spans( delete, upload, download ), 2 fs spans and 2 http spans
              });
            });
          });

          it('download-promise', async () => {
            await controls.sendRequest({
              method: 'GET',
              path: '/download-promise'
            });
            await retry(async () => {
              const spans = await agentControls.getSpans();
              await verify({
                spanName: 'azstorage',
                dataProperty: 'azstorage',
                path: '/download-promise',
                withError: false,
                spans: spans,
                op: 'download',
                totalspans: 6 // expects 3 azure spans( delete, upload, download ), 2 fs spans and 1 http span
              });
            });
          });

          it('download-promise-err', async () => {
            await controls.sendRequest({
              method: 'GET',
              path: '/download-promise-err'
            });
            await retry(async () => {
              const spans = await agentControls.getSpans();
              await verify({
                spanName: 'azstorage',
                dataProperty: 'azstorage',
                path: '/download-promise-err',
                withError: true,
                spans: spans,
                op: 'download',
                totalspans: 2 // expects 1 azure download span and 1 http span
              });
            });
          });

          it('download - err', async () => {
            await controls.sendRequest({
              method: 'GET',
              path: '/download-err'
            });
            await retry(async () => {
              const spans = await agentControls.getSpans();
              await verify({
                spanName: 'azstorage',
                dataProperty: 'azstorage',
                path: '/download-err',
                withError: true,
                spans: spans,
                op: 'download',
                totalspans: 4 // expects 3 azure spans( delete, upload, download ) and 1 http span
              });
            });
          });

          it('download-blockblob-promise', async () => {
            await controls.sendRequest({
              method: 'GET',
              path: '/download-blockblob-promise'
            });
            await retry(async () => {
              const spans = await agentControls.getSpans();
              await verify({
                spanName: 'azstorage',
                dataProperty: 'azstorage',
                path: '/download-blockblob-promise',
                withError: false,
                spans: spans,
                op: 'download',
                totalspans: 4 // expects 3 azure spans( delete, upload, download ) and 1 http span
              });
            });
          });

          async function verify({ spanName, dataProperty, path, withError, spans, op, totalspans }) {
            const _pid = String(controls.getPid());
            const parent = verifyHttpRootEntry({
              spans,
              apiPath: path,
              pid: _pid
            });
            expectExactlyOneMatching(spans, [
              span => expect(span.n).to.equal('azstorage'),
              span => expect(span.k).to.equal(constants.EXIT),
              span => expect(span.t).to.equal(parent.t),
              span => expect(span.p).to.equal(parent.s),
              span => expect(span.f.e).to.equal(_pid),
              span => expect(span.f.h).to.equal('agent-stub-uuid'),
              span => expect(span.ec).to.equal(withError ? 1 : 0),
              span => expect(span.data).to.exist,
              span =>
                withError
                  ? expect(span.data[spanName].error).to.exist
                  : expect(span.data[spanName].error).to.be.undefined,
              span => expect(span.data[dataProperty || spanName]).to.be.an('object'),
              span => expect(span.data[dataProperty || spanName].accountName).to.exist,
              span => expect(span.data[dataProperty || spanName].blobName).to.exist,
              span => expect(span.data[dataProperty || spanName].containerName).to.exist,
              span => expect(span.data[dataProperty || spanName].op).to.exist,
              span => expect(span.data[dataProperty].op).to.equal(op)
            ]);
            expectExactlyNMatching(spans, totalspans, [
              span => expect(span.n).exist,
              span => expect(span.k).to.exist,
              span => expect(span.t).to.exist,
              span => expect(span.f.e).to.equal(_pid),
              span => expect(span.f.h).to.equal('agent-stub-uuid'),
              span => expect(span.s).to.exist,
              span => expect(span.data).to.exist,
              span => expect(span.ec).to.exist,
              span => expect(span.stack).to.exist
            ]);
          }
        });
        describe('tracing disabled', () => {
          let controls;
          before(async () => {
            controls = new ProcessControls({
              dirname: __dirname,
              useGlobalAgent: true,
              tracingEnabled: false,
              env: {
                AZURE_CONTAINER_NAME: containerName,
                AZURE_CONNECTION_STRING: connStr,
                AZURE_STORAGE_ACCOUNT: storageAccount,
                AZURE_ACCOUNT_KEY: accountKey,
                AZURE_BLOB_VERSION: version
              }
            });

            await controls.startAndWaitForAgentConnection();
          });

          beforeEach(async () => {
            await agentControls.clearReceivedTraceData();
          });

          after(async () => {
            await controls.stop();
          });

          afterEach(async () => {
            await controls.clearIpcMessages();
          });

          describe('attempt to get result', () => {
            it('should not trace', async () => {
              await controls.sendRequest({
                method: 'GET',
                path: '/upload'
              });
              return retry(() => delay(config.getTestTimeout() / 4))
                .then(() => agentControls.getSpans())
                .then(spans => {
                  if (spans.length > 0) {
                    fail(`Unexpected spans : ${stringifyItems(spans)}`);
                  }
                });
            });
          });
        });
        describe('tracing enabled, but supressed', () => {
          let controls;
          before(async () => {
            controls = new ProcessControls({
              dirname: __dirname,
              useGlobalAgent: true,
              env: {
                AZURE_CONTAINER_NAME: containerName,
                AZURE_CONNECTION_STRING: connStr,
                AZURE_STORAGE_ACCOUNT: storageAccount,
                AZURE_ACCOUNT_KEY: accountKey,
                AZURE_BLOB_VERSION: version
              }
            });

            await controls.startAndWaitForAgentConnection();
          });

          after(async () => {
            await controls.stop();
          });

          afterEach(async () => {
            await controls.clearIpcMessages();
          });

          describe('attempt to get result', () => {
            it('should not trace', async () => {
              await controls.sendRequest({
                suppressTracing: true,
                method: 'GET',
                path: '/upload'
              });
              return retry(() => delay(config.getTestTimeout() / 4))
                .then(() => agentControls.getSpans())
                .then(spans => {
                  if (spans.length > 0) {
                    fail(`Unexpected spans (suppressed: ${stringifyItems(spans)})`);
                  }
                });
            });
          });
        });
      });
    });
  });
}
