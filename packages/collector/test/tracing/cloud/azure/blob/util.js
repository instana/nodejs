/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

exports.miniNodeJsVer = '18.0.0';

if (require('semver').lt(process.versions.node, exports.miniNodeJsVer)) {
    exports.deleteContainer = function () { };
    exports.createContainer = function () { };
    return;
}

exports.deleteContainer = async function (containerClient) {
    try {
        await containerClient.delete();
        // eslint-disable-next-line no-console
        console.log('Container deleted successfully.');
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error deleting container:', error.message);
    }
};

exports.createContainer = async function (containerClient) {
    try {
        await containerClient.create();
        // eslint-disable-next-line no-console
        console.log(
            `Container created successfully.\n\tURL: ${containerClient.url}`
        );
    } catch (e) {
        // eslint-disable-next-line no-console
        console.log('Error in container creation:', e);
    }
};
