/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const { v4: uuid } = require('uuid');
const expect = require('chai').expect;
const semver = require('semver');
const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../../core/test/config');
const {
    verifyHttpRootEntry,
    expectExactlyNMatching
} = require('../../../../../../core/test/test_util');
const ProcessControls = require('../../../../test_util/ProcessControls');
const globalAgent = require('../../../../globalAgent');
const { createContainer, deleteContainer, miniNodeJsVer } = require('./util');

const mochaSuiteFn =
supportedVersion(process.versions.node || semver.lt(process.versions.node, miniNodeJsVer)) ? describe : describe.skip;

const { BlobServiceClient } = require('@azure/storage-blob');
const containerName = `test-${uuid()}`;
const storageAccount = 'blobtest098'; // process.env.STORAGE_ACCOUNT;
const accountKey = process.env.KEY;
const connStr =
`DefaultEndpointsProtocol=https;AccountName=${storageAccount};AccountKey=${accountKey};EndpointSuffix=core.windows.net`;
const blobServiceClient = BlobServiceClient.fromConnectionString(connStr);
const containerClient = blobServiceClient.getContainerClient(containerName);

mochaSuiteFn.only('tracing/blob', function () {
    this.timeout(config.getTestTimeout());

    before(async () => {
        await createContainer(containerClient);
    });

    after(async () => {
        await deleteContainer(containerClient);
    });

    globalAgent.setUpCleanUpHooks();
    const agentControls = globalAgent.instance;

    const controls = new ProcessControls({
        dirname: __dirname,
        useGlobalAgent: true,
        env: {
            CONTAINER_NAME: containerName,
            CONN_STR: connStr,
            STORAGE_ACC: storageAccount,
            ACC_KEY: accountKey,
            CONT_CLIENT: containerClient
        }
    });
    ProcessControls.setUpHooks(controls);

    it('uploadData and delete', async () => {
        await controls
            .sendRequest({
                method: 'GET',
                path: '/uploadData'
            });
        await verify({
            spanName: 'az_storage',
            dataProperty: 'az_storage',
            n: 2,
            path: '/uploadData',
            withError: false
        });
    });

    it('Error in delete-promise', async () => {
        await controls
            .sendRequest({
                method: 'GET',
                path: '/deleteError'
            });
        await verify({
            spanName: 'az_storage',
            dataProperty: 'az_storage',
            n: 1,
            path: '/deleteError',
            withError: true
        });
    });

    it('uploads block data', async () => {
        await controls
            .sendRequest({
                method: 'GET',
                path: '/uploadDataBlock'
            });
        await verify({
            spanName: 'az_storage',
            dataProperty: 'az_storage',
            n: 1,
            path: '/uploadDataBlock',
            withError: false
        });
    });

    it('upload - promise', async () => {
        await controls
            .sendRequest({
                method: 'GET',
                path: '/upload'
            });
        await verify({
            spanName: 'az_storage',
            dataProperty: 'az_storage',
            n: 1,
            path: '/upload',
            withError: false
        });
    });
    it('upload - err', async () => {
        await controls
            .sendRequest({
                method: 'GET',
                path: '/upload-err'
            });
        await verify({
            spanName: 'az_storage',
            dataProperty: 'az_storage',
            n: 1,
            path: '/upload-err',
            withError: true
        });
    });

    it('uploadData-delete-blobBatch-blobUri', async () => {
        await controls
            .sendRequest({
                method: 'GET',
                path: '/uploadData-delete-blobBatch-blobUri'
            });
        await verify({
            spanName: 'az_storage',
            dataProperty: 'az_storage',
            n: 2,
            path: '/uploadData-delete-blobBatch-blobUri',
            withError: false
        });
    });

    it('uploadData-delete-blobBatch-blobClient', async () => {
        await controls
            .sendRequest({
                method: 'GET',
                path: '/uploadData-delete-blobBatch-blobClient'
            });
        await verify({
            spanName: 'az_storage',
            dataProperty: 'az_storage',
            n: 2,
            path: '/uploadData-delete-blobBatch-blobClient',
            withError: false
        });
    });
    it('download', async () => {
        await controls
            .sendRequest({
                method: 'GET',
                path: '/download'
            });
        await verify({
            spanName: 'az_storage',
            dataProperty: 'az_storage',
            n: 3,
            path: '/download',
            withError: false
        });
    });

    it('download-promise', async () => {
        await controls
            .sendRequest({
                method: 'GET',
                path: '/download-promise'
            });
        await verify({
            spanName: 'az_storage',
            dataProperty: 'az_storage',
            n: 3,
            path: '/download-promise',
            withError: false
        });
    });

    it('download-promise-err', async () => {
        await controls
            .sendRequest({
                method: 'GET',
                path: '/download-promise-err'
            });
        await verify({
            spanName: 'az_storage',
            dataProperty: 'az_storage',
            n: 1,
            path: '/download-promise-err',
            withError: true
        });
    });

    it('download - err', async () => {
        await controls
            .sendRequest({
                method: 'GET',
                path: '/download-err'
            });
        await verify({
            spanName: 'az_storage',
            dataProperty: 'az_storage',
            n: 1,
            path: '/download-err',
            withError: true
        });
        await verify({
            spanName: 'az_storage',
            dataProperty: 'az_storage',
            n: 2,
            path: '/download-err',
            withError: false
        });
    });

    async function verify({ spanName, dataProperty, n, path, withError }) {
        const spans = await agentControls.getSpans();
        // spans.forEach((i) => { console.log('---------------spans------------->', i) }
        // );
        const _pid = String(controls.getPid());
        const parent = verifyHttpRootEntry({
            spans,
            apiPath: path,
            pid: _pid
        });
        return expectExactlyNMatching(spans, n, [
            span => expect(span.n).to.equal('az_storage'),
            span => expect(span.k).to.equal(constants.EXIT),
            span => expect(span.t).to.equal(parent.t),
            span => expect(span.p).to.equal(parent.s),
            span => expect(span.f.e).to.equal(_pid),
            span => expect(span.f.h).to.equal('agent-stub-uuid'),
            span => expect(span.ec).to.equal(withError ? 1 : 0),
            span => expect(span.data).to.exist,
            span => expect(span.data[dataProperty || spanName]).to.be.an('object')
        ]);
    }
});
