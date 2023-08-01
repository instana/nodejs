/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const cls = require('../../../../cls');
const { EXIT } = require('../../../../constants');
const { getStackTrace } = require('../../../../tracingUtil');
const { InstanaAWSProduct } = require('./instana_aws_product');

const SPAN_NAME = 'kinesis';

const operationsInfo = {
  CreateStreamCommand: {
    op: 'createStream'
  },
  DeleteStreamCommand: {
    op: 'deleteStream'
  },
  GetRecordsCommand: {
    op: 'getRecords'
  },
  GetShardIteratorCommand: {
    op: 'shardIterator'
  },
  ListStreamsCommand: {
    op: 'listStreams'
  },
  PutRecordCommand: {
    op: 'putRecord'
  },
  PutRecordsCommand: {
    op: 'putRecords'
  },
  ListShardsCommand: {
    op: 'listShards'
  }
};

const operations = Object.keys(operationsInfo);

class InstanaAWSKinesis extends InstanaAWSProduct {
  instrumentedSmithySend(ctx, originalSend, smithySendArgs) {
    // NOTE: `shimSmithySend`  in index.js is already checking the result of `isActive`
    if (cls.skipExitTracing()) {
      return originalSend.apply(ctx, smithySendArgs);
    }

    const command = smithySendArgs[0];
    return cls.ns.runAndReturn(() => {
      const self = this;
      const span = cls.startSpan(this.spanName, EXIT);
      span.ts = Date.now();
      span.stack = getStackTrace(this.instrumentedSend, 1);
      span.data[this.spanName] = this.buildSpanData(command.constructor.name, command.input);
      this.captureRegion(ctx, span);

      if (typeof smithySendArgs[1] === 'function') {
        const _callback = smithySendArgs[1];

        smithySendArgs[1] = cls.ns.bind(function (err) {
          if (err) {
            _callback.apply(this, arguments);
            self.finishSpan(err, span);
          } else {
            _callback.apply(this, arguments);
            self.finishSpan(null, span);
          }
        });

        return originalSend.apply(ctx, smithySendArgs);
      } else {
        const request = originalSend.apply(ctx, smithySendArgs);

        request
          .then(() => {
            this.finishSpan(null, span);
          })
          .catch(err => {
            this.finishSpan(err, span);
          });

        return request;
      }
    });
  }

  buildSpanData(operation, params) {
    const operationInfo = operationsInfo[operation];
    if (!params) {
      return { op: operationInfo.op };
    }

    const spanData = { op: operationInfo.op };
    if (params.StreamName) {
      spanData.stream = params.StreamName;
    }
    if (params.ExplicitHashKey) {
      spanData.record = params.ExplicitHashKey;
    }
    if (params.ShardIteratorType) {
      spanData.shardType = params.ShardIteratorType;
    }
    if (params.StartingSequenceNumber) {
      spanData.startSequenceNumber = params.StartingSequenceNumber;
    }
    if (params.ShardId) {
      spanData.shard = params.ShardId;
    }

    return spanData;
  }

  async captureRegion(ctx, span) {
    if (typeof ctx.config.region === 'function') {
      try {
        const region = await ctx.config.region();
        span.data[this.spanName].region = region;
      } catch (error) {
        /* Silently ignore failed attempts to get the region */
      }
    }
  }
}

module.exports = new InstanaAWSKinesis(SPAN_NAME, operations);
