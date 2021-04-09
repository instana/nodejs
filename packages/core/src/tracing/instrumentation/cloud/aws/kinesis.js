/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const shimmer = require('shimmer');
const requireHook = require('../../../../util/requireHook');
const cls = require('../../../cls');
const { EXIT, isExitSpan } = require('../../../constants');
const tracingUtil = require('../../../tracingUtil');

const operationsInfo = {
  createStream: {
    op: 'createStream',
  },
  deleteStream: {
    op: 'deleteStream',
  },
  getRecords: {
    op: 'getRecords',
  },
  getShardIterator: {
    op: 'shardIterator',
  },
  listStreams: {
    op: 'listStreams',
  },
  putRecord: {
    op: 'putRecord',
  },
  putRecords: {
    op: 'putRecords',
  },
  listShards: {
    op: 'listShards',
  },
};

const methodList = Object.keys(operationsInfo);

let isActive = false;

exports.isActive = function () {
  return isActive;
};

exports.init = function init() {
  requireHook.onModuleLoad('aws-sdk', instrumentAWS);
};

exports.activate = function activate() {
  isActive = true;
};

exports.deactivate = function deactivate() {
  isActive = false;
};

function instrumentAWS(AWS) {
  shimmer.wrap(AWS.Service.prototype, 'makeRequest', shimMakeRequest);
}

function shimMakeRequest(originalMakeRequest) {
  return function () {
    if (isActive) {
      const originalArgs = new Array(arguments.length);
      for (let i = 0; i < originalArgs.length; i++) {
        originalArgs[i] = arguments[i];
      }

      return instrumentedMakeRequest(this, originalMakeRequest, originalArgs);
    }

    return originalMakeRequest.apply(this, arguments);
  };
}

function instrumentedMakeRequest(ctx, originalMakeRequest, originalArgs) {
  if (!isOperationShimmable(originalArgs[0]) || cls.tracingSuppressed()) {
    return originalMakeRequest.apply(ctx, originalArgs);
  }

  const parentSpan = cls.getCurrentSpan();

  if (!parentSpan || isExitSpan(parentSpan)) {
    return originalMakeRequest.apply(ctx, originalArgs);
  }

  return cls.ns.runAndReturn(() => {
    const span = cls.startSpan('kinesis', EXIT);
    span.ts = Date.now();
    span.stack = tracingUtil.getStackTrace(instrumentedMakeRequest);
    // Data attribs: op and stream
    span.data.kinesis = buildSpanData(originalArgs[0], originalArgs[1]);

    if (typeof originalArgs[2] === 'function') {
      // callback case
      const _originalCallback = originalArgs[2];

      originalArgs[2] = cls.ns.bind(function (err, data) {
        if (data && data.code) {
          finishSpan(data, span);
        } else {
          finishSpan(err, span);
        }
        return _originalCallback.apply(this, arguments);
      });
    }

    const request = originalMakeRequest.apply(ctx, originalArgs);

    if (typeof request.promise === 'function' && typeof originalArgs[2] !== 'function') {
      // promise case
      const originalPromise = request.promise;

      request.promise = cls.ns.bind(function () {
        const promise = originalPromise.apply(request, arguments);
        return promise
          .then(data => {
            if (data && data.code) {
              finishSpan(data, span);
            } else {
              finishSpan(null, span);
            }

            return data;
          })
          .catch(err => {
            finishSpan(err, span);
            return err;
          });
      });
    }

    return request;
  });
}

function finishSpan(err, span) {
  if (err) {
    addErrorToSpan(err, span);
  }

  span.d = Date.now() - span.ts;
  span.transmit();
}

function addErrorToSpan(err, span) {
  if (err) {
    span.ec = 1;
    const kinesisData = span.data && span.data.kinesis;
    if (kinesisData) {
      kinesisData.error = err.message || err.code || JSON.stringify(err);
    }
  }
}

function buildSpanData(operation, params) {
  const operationInfo = operationsInfo[operation];
  const spanData = {
    op: operationInfo.op,
  };

  // Not present in listStreams and getRecords
  if (params && params.StreamName) {
    spanData.stream = params.StreamName;
  }
  // Can be present when putRecord operation is called
  if (params && params.ExplicitHashKey) {
    spanData.record = params.ExplicitHashKey;
  }
  // Present in getShardIterator
  if (params && params.ShardIteratorType) {
    spanData.shardType = params.ShardIteratorType;
  }
  // Present in getShardIterator when shardType is AT_SEQUENCE_NUMBER and AFTER_SEQUENCE_NUMBER
  if (params && params.StartingSequenceNumber) {
    spanData.startSequenceNumber = params.StartingSequenceNumber;
  }
  if (params && params.ShardId) {
    spanData.shard = params.ShardId;
  }

  return spanData;
}

function isOperationShimmable(operation) {
  return methodList.includes(operation);
}
