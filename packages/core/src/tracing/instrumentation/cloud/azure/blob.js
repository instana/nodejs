/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const shimmer = require('../../../shimmer');

const requireHook = require('../../../../util/requireHook');
const tracingUtil = require('../../../tracingUtil');
const constants = require('../../../constants');
const cls = require('../../../cls');

let isActive = false;

exports.spanName = 'azstorage';

exports.init = function init() {
    requireHook.onModuleLoad('@azure/storage-blob', instrumentBlob);
};

function instrumentBlob(blob) {
    instrumentBlockBlob(blob.BlockBlobClient);
    instrumentContainer(blob.BlobClient);
}
function instrumentContainer(blobClient) {
    shimmer.wrap(blobClient.prototype, 'delete', shimDelete);
    shimmer.wrap(blobClient.prototype, 'download', shimDownload);
}
function instrumentBlockBlob(blockBlobClient) {
    shimmer.wrap(blockBlobClient.prototype, 'upload', shimUpload);
    shimmer.wrap(blockBlobClient.prototype, 'stageBlock', shimUpload);
}
function shimUpload(original) {
    return function () {
        if (cls.skipExitTracing({ isActive })) {
            return original.apply(this, arguments);
        }
        const argsForOriginalQuery = new Array(arguments.length);
        for (let i = 0; i < arguments.length; i++) {
            argsForOriginalQuery[i] = arguments[i];
        }
        return instrumentedOperation({
            ctx: this,
            originalQuery: original,
            argsForOriginalQuery: argsForOriginalQuery,
            _blobName: this._name,
            _container: this._containerName,
            accntName: this.accountName,
            operation: 'upload'
        });
    };
}
function shimDelete(original) {
    return function () {
        if (cls.skipExitTracing({ isActive })) {
            return original.apply(this, arguments);
        }
        const argsForOriginalQuery = new Array(arguments.length);
        for (let i = 0; i < arguments.length; i++) {
            argsForOriginalQuery[i] = arguments[i];
        }
        return instrumentedOperation({
            ctx: this,
            originalQuery: original,
            argsForOriginalQuery: argsForOriginalQuery,
            _blobName: this._name,
            _container: this._containerName,
            accntName: this.accountName,
            operation: 'delete'
        });
    };
}
function shimDownload(original) {
    return function () {
        if (cls.skipExitTracing({ isActive })) {
            return original.apply(this, arguments);
        }
        const argsForOriginalQuery = new Array(arguments.length);
        for (let i = 0; i < arguments.length; i++) {
            argsForOriginalQuery[i] = arguments[i];
        }
        return instrumentedOperation({
            ctx: this,
            originalQuery: original,
            argsForOriginalQuery: argsForOriginalQuery,
            _blobName: this._name,
            _container: this._containerName,
            accntName: this.accountName,
            operation: 'download'
        });
    };
}

function instrumentedOperation({ ctx,
    originalQuery,
    argsForOriginalQuery,
    _blobName,
    _container,
    accntName,
    operation
}) {
    const blob = _blobName;
    const container = _container;
    const accountName = accntName;
    const op = operation;

    return cls.ns.runAndReturn(() => {
        const span = cls.startSpan(exports.spanName, constants.EXIT);
        span.stack = tracingUtil.getStackTrace(instrumentedOperation);
        span.data.azstorage = {
            container,
            blob,
            accountName,
            op
        };
        let originalCallback;
        let callbackIndex = -1;
        for (let i = 1; i < argsForOriginalQuery.length; i++) {
            if (typeof argsForOriginalQuery[i] === 'function') {
                originalCallback = argsForOriginalQuery[i];
                callbackIndex = i;
                break;
            }
        }

        if (callbackIndex >= 0) {
            const wrappedCallback = function (error) {
                finishSpan(error, span);
                return originalCallback.apply(this, arguments);
            };
            argsForOriginalQuery[callbackIndex] = cls.ns.bind(wrappedCallback);
        }

        const promise = originalQuery.apply(ctx, argsForOriginalQuery);
        if (promise && typeof promise.then === 'function') {
            promise
                .then(value => {
                    finishSpan(null, span);
                    return value;
                })
                .catch(error => {
                    finishSpan(error, span);
                    return error;
                });
        }
        return promise;
    });
}

function finishSpan(error, span) {
    if (error) {
        span.ec = 1;
        span.data.azstorage.error = tracingUtil.getErrorDetails(error);
    }
    span.d = Date.now() - span.ts;
    span.transmit();
}

exports.activate = function activate() {
    isActive = true;
};

exports.deactivate = function deactivate() {
    isActive = false;
};