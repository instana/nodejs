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
  instrumentedInnerLoggerMiddleware(ctx, originalInnerLoggerMiddleware, originalInnerFuncArgs, originalParentFuncArgs) {
    const parentSpan = cls.getCurrentSpan();

    if (!parentSpan || isExitSpan(parentSpan)) {
      return originalInnerLoggerMiddleware.apply(ctx, originalInnerFuncArgs);
    }

    return cls.ns.runAndReturn(() => {
      const span = cls.startSpan(this.spanName, EXIT);
      span.ts = Date.now();
      span.stack = tracingUtil.getStackTrace(this.instrumentedInnerLoggerMiddleware);
      span.data[this.spanName] = this.buildSpanData(
        originalParentFuncArgs[1].commandName,
        originalInnerFuncArgs[0].input
      );

      const request = originalInnerLoggerMiddleware.apply(ctx, originalInnerFuncArgs);

      request
        .then(() => {
          this.finishSpan(null, span);
        })
        .catch(err => {
          this.finishSpan(err, span);
        });

      return request;
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
