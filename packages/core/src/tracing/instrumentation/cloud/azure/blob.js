/*
 * (c) Copyright IBM Corp. 2023
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
  instrumentBlobClient(blob.BlobClient);
}

// For the download and delete functionality applicable to block blobs, the BlockBlobClient extends BlobClient
// and uses the 'download' and 'delete' methods respectively. Hence we are instrmenting the BlobClient
function instrumentBlobClient(blobClient) {
  shimmer.wrap(blobClient.prototype, 'delete', shimDelete);
  shimmer.wrap(blobClient.prototype, 'download', shimDownload);
}
function instrumentBlockBlob(blockBlobClient) {
  shimmer.wrap(blockBlobClient.prototype, 'upload', shimUpload);
  shimmer.wrap(blockBlobClient.prototype, 'stageBlock', shimUpload);
}
function shimUpload(original) {
  return function instrumentUpload() {
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
  return function instrumentDelete() {
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
  return function instrumentDownload() {
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

function instrumentedOperation({
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
    const span = cls.startSpan(exports.spanName, constants.EXIT);
    span.stack = tracingUtil.getStackTrace(instrumentedOperation);
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
