/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const cls = require('../../../../cls');
const { EXIT, isExitSpan } = require('../../../../constants');
const tracingUtil = require('../../../../tracingUtil');
const { InstanaAWSProduct } = require('./instana_aws_product');

const operationsInfo = {
  ListBucketsCommand: {
    op: 'list',
    hasKey: false
  },
  CreateBucketCommand: {
    op: 'createBucket',
    hasKey: false
  },
  DeleteBucketCommand: {
    op: 'deleteBucket',
    hasKey: false
  },
  HeadObjectCommand: {
    op: 'metadata',
    hasKey: true
  },
  PutObjectCommand: {
    op: 'put',
    hasKey: true
  },
  DeleteObjectCommand: {
    op: 'delete',
    hasKey: true
  },
  GetObjectCommand: {
    op: 'get',
    hasKey: true
  },
  ListObjectsCommand: {
    op: 'list',
    hasKey: false
  },
  ListObjectsV2Command: {
    op: 'list',
    hasKey: false
  }
};

const operations = Object.keys(operationsInfo);

const SPAN_NAME = 's3';

class InstanaAWSS3 extends InstanaAWSProduct {
  instrumentedSmithySend(ctx, originalSend, smithySendArgs) {
    const parentSpan = cls.getCurrentSpan();
    const command = smithySendArgs[0];

    if (!parentSpan || isExitSpan(parentSpan)) {
      return originalSend.apply(ctx, smithySendArgs);
    }

    return cls.ns.runAndReturn(() => {
      const self = this;
      const span = cls.startSpan(this.spanName, EXIT);
      span.ts = Date.now();
      span.stack = tracingUtil.getStackTrace(this.instrumentedSmithySend, 1);
      span.data[this.spanName] = this.buildSpanData(command.constructor.name, command.input);

      if (typeof smithySendArgs[1] === 'function') {
        const _callback = smithySendArgs[1];

        smithySendArgs[1] = cls.ns.bind(function (err /** , data */) {
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
    const methodInfo = operationsInfo[operation];
    const s3Data = {
      op: methodInfo.op
    };

    if (params && params.Bucket) {
      s3Data.bucket = params.Bucket;
    }

    if (methodInfo.hasKey) {
      s3Data.key = params.Key;
    }

    return s3Data;
  }
}

module.exports = new InstanaAWSS3(SPAN_NAME, operations);
