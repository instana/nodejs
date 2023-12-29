/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

exports.minimumNodeJsVer = '18.0.0';

exports.deleteContainer = async function (containerClient) {
    try {
        await containerClient.delete();
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error deleting container:', error.message);
    }
};

exports.createContainer = async function (containerClient) {
    try {
        await containerClient.create();
    } catch (e) {
        // eslint-disable-next-line no-console
        console.log('Error in container creation:', e);
    }
};
