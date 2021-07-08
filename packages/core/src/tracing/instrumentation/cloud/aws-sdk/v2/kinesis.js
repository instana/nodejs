/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const cls = require('../../../../cls');
const { EXIT, isExitSpan } = require('../../../../constants');
const tracingUtil = require('../../../../tracingUtil');
const { InstanaAWSProduct } = require('./instana_aws_product');

const SPAN_NAME = 'kinesis';

const operationsInfo = {
  createStream: {
    op: 'createStream'
  },
  deleteStream: {
    op: 'deleteStream'
  },
  getRecords: {
    op: 'getRecords'
  },
  getShardIterator: {
    op: 'shardIterator'
  },
  listStreams: {
    op: 'listStreams'
  },
  putRecord: {
    op: 'putRecord'
  },
  putRecords: {
    op: 'putRecords'
  },
  listShards: {
    op: 'listShards'
  }
};

const operations = Object.keys(operationsInfo);

class InstanaAWSKinesis extends InstanaAWSProduct {
  instrumentedMakeRequest(ctx, originalMakeRequest, originalArgs) {
    const parentSpan = cls.getCurrentSpan();
    const self = this;

    if (!parentSpan || isExitSpan(parentSpan)) {
      return originalMakeRequest.apply(ctx, originalArgs);
    }

    return cls.ns.runAndReturn(() => {
      const span = cls.startSpan(this.spanName, EXIT);
      span.ts = Date.now();
      span.stack = tracingUtil.getStackTrace(this.instrumentedMakeRequest, 1);
      // Data attribs: op and stream
      span.data[this.spanName] = this.buildSpanData(originalArgs[0], originalArgs[1]);

      if (typeof originalArgs[2] === 'function') {
        // callback case
        const _originalCallback = originalArgs[2];

        originalArgs[2] = cls.ns.bind(function (err, data) {
          if (data && data.code) {
            self.finishSpan(data, span);
          } else {
            self.finishSpan(err, span);
          }
          return _originalCallback.apply(this, arguments);
        });
      }

      const request = originalMakeRequest.apply(ctx, originalArgs);

      if (typeof request.promise === 'function' && typeof originalArgs[2] !== 'function') {
        // promise case
        const originalPromise = request.promise;

        request.promise = cls.ns.bind(() => {
          const promise = originalPromise.apply(request, arguments);
          return promise
            .then(data => {
              if (data && data.code) {
                this.finishSpan(data, span);
              } else {
                this.finishSpan(null, span);
              }

              return data;
            })
            .catch(err => {
              this.finishSpan(err, span);
              return err;
            });
        });
      }

      return request;
    });
  }

  buildSpanData(operation, params) {
    const operationInfo = operationsInfo[operation];
    const spanData = {
      op: operationInfo.op
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
}

module.exports = new InstanaAWSKinesis(SPAN_NAME, operations);
