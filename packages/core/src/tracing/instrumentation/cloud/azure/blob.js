/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const shimmer = require('../../../shimmer');

const hook = require('../../../../util/hook');
const tracingUtil = require('../../../tracingUtil');
const constants = require('../../../constants');
const cls = require('../../../cls');

let isActive = false;

exports.spanName = 'azstorage';

exports.init = function init() {
  // Starting from v12.28.0, the package has been migrated to ESM.
  // To support ESM-based applications, we now utilize the IITM hook.
  // Reference: https://github.com/Azure/azure-sdk-for-js/pull/33329
  hook.onModuleLoad('@azure/storage-blob', instrumentBlob, { nativeEsm: true });
};

function instrumentBlob(blob) {
  instrumentBlockBlob(blob.BlockBlobClient);
  instrumentBlobClient(blob.BlobClient);
}

// For the download and delete functionality applicable to block blobs, the BlockBlobClient extends BlobClient
// and uses the 'download' and 'delete' methods respectively. Hence we are instrmenting the BlobClient
function instrumentBlobClient(blobClient) {
  shimmer.wrap(blobClient.prototype, 'delete', shimOperation('delete'));
  shimmer.wrap(blobClient.prototype, 'download', shimOperation('download'));
}
function instrumentBlockBlob(blockBlobClient) {
  shimmer.wrap(blockBlobClient.prototype, 'upload', shimOperation('upload'));
  shimmer.wrap(blockBlobClient.prototype, 'stageBlock', shimOperation('upload'));
}

function shimOperation(operation) {
  return function instrumentOperation(original) {
    return function instrumentedOperation() {
      if (cls.skipExitTracing({ isActive })) {
        return original.apply(this, arguments);
      }
      const argsForOriginalQuery = new Array(arguments.length);
      for (let i = 0; i < arguments.length; i++) {
        argsForOriginalQuery[i] = arguments[i];
      }
      return instrumentingOperation({
        ctx: this,
        originalQuery: original,
        argsForOriginalQuery: argsForOriginalQuery,
        _blobName: this._name,
        _container: this._containerName,
        accntName: this.accountName,
        operation: operation
      });
    };
  };
}

function instrumentingOperation({
  ctx,
  originalQuery,
  argsForOriginalQuery,
  _blobName,
  _container,
  accntName,
  operation
}) {
  const blobName = _blobName;
  const containerName = _container;
  const accountName = accntName;
  const op = operation;
  return cls.ns.runAndReturn(() => {
    const span = cls.startSpan({
      spanName: exports.spanName,
      kind: constants.EXIT
    });
    span.stack = tracingUtil.getStackTrace(instrumentingOperation);
    span.data.azstorage = {
      containerName,
      blobName,
      accountName,
      op
    };
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
    const errorValue = tracingUtil.getErrorDetails(error);
    const key = 'azstorage';
    span.data[key].error = errorValue;
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
