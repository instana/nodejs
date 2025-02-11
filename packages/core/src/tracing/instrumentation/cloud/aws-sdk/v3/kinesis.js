/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const cls = require('../../../../cls');
const { EXIT } = require('../../../../constants');
const tracingUtil = require('../../../../tracingUtil');
const { InstanaAWSProduct } = require('./instana_aws_product');

const SPAN_NAME = 'kinesis';

class InstanaAWSKinesis extends InstanaAWSProduct {
  instrumentedSmithySend(ctx, isActive, originalSend, smithySendArgs) {
    if (cls.skipExitTracing({ isActive })) {
      return originalSend.apply(ctx, smithySendArgs);
    }

    const command = smithySendArgs[0];
    return cls.ns.runAndReturn(() => {
      const self = this;
      const span = cls.startSpan({
        spanName: this.spanName,
        kind: EXIT
      });
      span.ts = Date.now();
      span.stack = tracingUtil.getStackTrace(this.instrumentedSmithySend, 1);
      const operation = this.convertOperationName(command.constructor.name);
      span.data[this.spanName] = this.buildSpanData(operation, smithySendArgs[0].input);
      const callback = typeof smithySendArgs[1] === 'function' ? smithySendArgs[1] : smithySendArgs[2];
      if (callback) {
        const callbackIndex = callback === smithySendArgs[1] ? 1 : 2;
        smithySendArgs[callbackIndex] = cls.ns.bind(function (err) {
          if (err) {
            self.finishSpan(err, span);
          } else {
            self.finishSpan(null, span);
          }
          callback.apply(this, arguments);
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
    const spanData = { op: operation };
    if (!params) {
      return spanData;
    }

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
}

module.exports = new InstanaAWSKinesis(SPAN_NAME);
