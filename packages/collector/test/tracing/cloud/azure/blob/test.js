/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const { v4: uuid } = require('uuid');
const expect = require('chai').expect;
const semver = require('semver');
const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../../core/test/config');
const { verifyHttpRootEntry, expectExactlyNMatching } = require('../../../../../../core/test/test_util');
const ProcessControls = require('../../../../test_util/ProcessControls');
const globalAgent = require('../../../../globalAgent');
const { fail } = expect;
const testUtils = require('../../../../../../core/test/test_util');
const { createContainer, deleteContainer, minimumNodeJsVer } = require('./util');
const { BlobServiceClient } = require('@azure/storage-blob');
const containerName = `nodejs-team-${uuid()}`;
const storageAccount = process.env.AZ_STORAGE_ACCOUNT_NAME;
const accountKey = process.env.AZ_STORAGE_ACCOUNT_KEY;

/**
 * endPoint is assigned with the default constant string for appending EndpointSuffix
 * to connection string of an azure account
 */
const endPoint = 'EndpointSuffix=core.windows.net';
const connStr = `DefaultEndpointsProtocol=https;AccountName=${storageAccount};AccountKey=${accountKey};${endPoint}`;
const blobServiceClient = BlobServiceClient.fromConnectionString(connStr);
const containerClient = blobServiceClient.getContainerClient(containerName);

let mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;
mochaSuiteFn = semver.lt(process.versions.node, minimumNodeJsVer) ? describe.skip : mochaSuiteFn;

/**
 * This suite is skipped if no storageAccount or accountKey has been provided via AZ_STORAGE_ACCOUNT_NAME
 * and AZ_STORAGE_ACCOUNT_KEY. For the Azure blob tests, the azure storage account used is teamnodejstracer
 * which is the value for AZ_STORAGE_ACCOUNT_NAME. From the azure portal, navigate to this storage account
 * and under the Access keys, Key can be found for AZ_STORAGE_ACCOUNT_KEY.
 */
if (!storageAccount || !accountKey) {
  describe('tracing/cloud/azure/blob', function () {
    it('The configuration for Azure is missing', () => {
      fail('Please set process.env.AZ_STORAGE_ACCOUNT_KEY and process.env.AZ_STORAGE_ACCOUNT_NAME before tests.');
    });
  });
} else {
  mochaSuiteFn('tracing/cloud/azure/blob', function () {
    this.timeout(config.getTestTimeout());
    globalAgent.setUpCleanUpHooks();
    const agentControls = globalAgent.instance;

    const controls = new ProcessControls({
      dirname: __dirname,
      useGlobalAgent: true,
      env: {
        AZURE_CONTAINER_NAME: containerName,
        AZURE_CONNECTION_STRING: connStr,
        AZURE_STORAGE_ACCOUNT: storageAccount,
        AZURE_ACCOUNT_KEY: accountKey
      }
    });
    ProcessControls.setUpHooks(controls);

    before(async () => {
      await createContainer(containerClient);
    });

    after(async () => {
      await deleteContainer(containerClient);
    });

    it('uploads block data', async () => {
      await controls.sendRequest({
        method: 'GET',
        path: '/uploadDataBlock'
      });
      await testUtils.retry(async () => {
        const spans = await agentControls.getSpans();
        await verify({
          spanName: 'azstorage',
          dataProperty: 'azstorage',
          n: 1,
          path: '/uploadDataBlock',
          withError: false,
          spans: spans,
          op: 'upload',
          opSpanCount: 1
        });
      });
    });

    it('upload - promise', async () => {
      await controls.sendRequest({
        method: 'GET',
        path: '/upload'
      });
      await testUtils.retry(async () => {
        const spans = await agentControls.getSpans();
        await verify({
          spanName: 'azstorage',
          dataProperty: 'azstorage',
          n: 1,
          path: '/upload',
          withError: false,
          spans: spans,
          op: 'upload',
          opSpanCount: 1
        });
      });
    });

    it('upload - err', async () => {
      await controls.sendRequest({
        method: 'GET',
        path: '/upload-err'
      });
      await testUtils.retry(async () => {
        const spans = await agentControls.getSpans();
        await verify({
          spanName: 'azstorage',
          dataProperty: 'azstorage',
          n: 1,
          path: '/upload-err',
          withError: true,
          spans: spans,
          op: 'upload',
          opSpanCount: 1
        });
      });
    });

    it('uploadData and delete', async () => {
      await controls.sendRequest({
        method: 'GET',
        path: '/uploadData'
      });
      await testUtils.retry(async () => {
        const spans = await agentControls.getSpans();
        await verify({
          spanName: 'azstorage',
          dataProperty: 'azstorage',
          n: 2,
          path: '/uploadData',
          withError: false,
          spans: spans,
          op: 'upload',
          opSpanCount: 1
        });
      });
    });

    it('Error in delete-promise', async () => {
      await controls.sendRequest({
        method: 'GET',
        path: '/deleteError'
      });
      await testUtils.retry(async () => {
        const spans = await agentControls.getSpans();
        await verify({
          spanName: 'azstorage',
          dataProperty: 'azstorage',
          n: 1,
          path: '/deleteError',
          withError: true,
          spans: spans,
          op: 'delete',
          opSpanCount: 2
        });
      });
    });

    it('uploadData-delete-blobBatch-blobUri', async () => {
      await controls.sendRequest({
        method: 'GET',
        path: '/uploadData-delete-blobBatch-blobUri'
      });
      await testUtils.retry(async () => {
        const spans = await agentControls.getSpans();
        await verify({
          spanName: 'azstorage',
          dataProperty: 'azstorage',
          n: 2,
          path: '/uploadData-delete-blobBatch-blobUri',
          withError: false,
          spans: spans,
          op: 'delete',
          opSpanCount: 1
        });
      });
    });

    it('uploadData-delete-blobBatch-blobClient', async () => {
      await controls.sendRequest({
        method: 'GET',
        path: '/uploadData-delete-blobBatch-blobClient'
      });
      await testUtils.retry(async () => {
        const spans = await agentControls.getSpans();
        await verify({
          spanName: 'azstorage',
          dataProperty: 'azstorage',
          n: 2,
          path: '/uploadData-delete-blobBatch-blobClient',
          withError: false,
          spans: spans,
          op: 'delete',
          opSpanCount: 1
        });
      });
    });

    it('download-await', async () => {
      await controls.sendRequest({
        method: 'GET',
        path: '/download-await'
      });
      await testUtils.retry(async () => {
        const spans = await agentControls.getSpans();
        await verify({
          spanName: 'azstorage',
          dataProperty: 'azstorage',
          n: 3,
          path: '/download-await',
          withError: false,
          spans: spans,
          op: 'download',
          opSpanCount: 1
        });
      });
    });

    it('download', async () => {
      await controls.sendRequest({
        method: 'GET',
        path: '/download'
      });
      await testUtils.retry(async () => {
        const spans = await agentControls.getSpans();
        await verify({
          spanName: 'azstorage',
          dataProperty: 'azstorage',
          n: 3,
          path: '/download',
          withError: false,
          spans: spans,
          op: 'download',
          opSpanCount: 1
        });
      });
    });

    it('download to buffer', async () => {
      await controls.sendRequest({
        method: 'GET',
        path: '/download-buffer'
      });
      await testUtils.retry(async () => {
        const spans = await agentControls.getSpans();
        await verify({
          spanName: 'azstorage',
          dataProperty: 'azstorage',
          n: 3,
          path: '/download-buffer',
          withError: false,
          spans: spans,
          op: 'download',
          opSpanCount: 1
        });
      });
    });

    it('download to buffer-promise', async () => {
      await controls.sendRequest({
        method: 'GET',
        path: '/download-buffer-promise'
      });
      await testUtils.retry(async () => {
        const spans = await agentControls.getSpans();
        await verify({
          spanName: 'azstorage',
          dataProperty: 'azstorage',
          n: 3,
          path: '/download-buffer-promise',
          withError: false,
          spans: spans,
          op: 'download',
          opSpanCount: 1
        });
      });
    });

    it('download-promise', async () => {
      await controls.sendRequest({
        method: 'GET',
        path: '/download-promise'
      });
      await testUtils.retry(async () => {
        const spans = await agentControls.getSpans();
        await verify({
          spanName: 'azstorage',
          dataProperty: 'azstorage',
          n: 3,
          path: '/download-promise',
          withError: false,
          spans: spans,
          op: 'download',
          opSpanCount: 1
        });
      });
    });

    it('download-promise-err', async () => {
      await controls.sendRequest({
        method: 'GET',
        path: '/download-promise-err'
      });
      await testUtils.retry(async () => {
        const spans = await agentControls.getSpans();
        await verify({
          spanName: 'azstorage',
          dataProperty: 'azstorage',
          n: 1,
          path: '/download-promise-err',
          withError: true,
          spans: spans,
          op: 'download',
          opSpanCount: 1
        });
      });
    });

    it('download - err', async () => {
      await controls.sendRequest({
        method: 'GET',
        path: '/download-err'
      });
      await testUtils.retry(async () => {
        const spans = await agentControls.getSpans();
        await verify({
          spanName: 'azstorage',
          dataProperty: 'azstorage',
          n: 1,
          path: '/download-err',
          withError: true,
          spans: spans,
          op: 'download',
          opSpanCount: 1
        });
      });
    });

    it('download-blockblob-promise', async () => {
      await controls.sendRequest({
        method: 'GET',
        path: '/download-blockblob-promise'
      });
      await testUtils.retry(async () => {
        const spans = await agentControls.getSpans();
        await verify({
          spanName: 'azstorage',
          dataProperty: 'azstorage',
          n: 3,
          path: '/download-blockblob-promise',
          withError: false,
          spans: spans,
          op: 'download',
          opSpanCount: 1
        });
      });
    });

    async function verify({ spanName, dataProperty, n, path, withError, spans, op, opSpanCount }) {
      const _pid = String(controls.getPid());
      const parent = verifyHttpRootEntry({
        spans,
        apiPath: path,
        pid: _pid
      });
      expectExactlyNMatching(spans, n, [
        span => expect(span.n).to.equal('azstorage'),
        span => expect(span.k).to.equal(constants.EXIT),
        span => expect(span.t).to.equal(parent.t),
        span => expect(span.p).to.equal(parent.s),
        span => expect(span.f.e).to.equal(_pid),
        span => expect(span.f.h).to.equal('agent-stub-uuid'),
        span => expect(span.ec).to.equal(withError ? 1 : 0),
        span => expect(span.data).to.exist,
        span =>
          withError ? expect(span.data[spanName].error).to.exist : expect(span.data[spanName].error).to.be.undefined,
        span => expect(span.data[dataProperty || spanName]).to.be.an('object'),
        span => expect(span.data[dataProperty || spanName].accountName).to.exist,
        span => expect(span.data[dataProperty || spanName].blobName).to.exist,
        span => expect(span.data[dataProperty || spanName].containerName).to.exist,
        span => expect(span.data[dataProperty || spanName].op).to.exist
      ]);
      expectExactlyNMatching(spans, opSpanCount, [span => expect(span.data[dataProperty].op).to.equal(op)]);
    }
  });
}
