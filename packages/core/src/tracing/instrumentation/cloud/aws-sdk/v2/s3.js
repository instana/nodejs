/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const cls = require('../../../../cls');
const { EXIT, isExitSpan } = require('../../../../constants');
const tracingUtil = require('../../../../tracingUtil');
const { InstanaAWSProduct } = require('./instana_aws_product');

const s3MethodsInfo = {
  listBuckets: {
    op: 'list',
    hasKey: false
  },
  createBucket: {
    op: 'createBucket',
    hasKey: false
  },
  deleteBucket: {
    op: 'deleteBucket',
    hasKey: false
  },
  headObject: {
    op: 'metadata',
    hasKey: true
  },
  putObject: {
    op: 'put',
    hasKey: true
  },
  deleteObject: {
    op: 'delete',
    hasKey: true
  },
  getObject: {
    op: 'get',
    hasKey: true
  },
  listObjects: {
    op: 'list',
    hasKey: false
  },
  listObjectsV2: {
    op: 'list',
    hasKey: false
  }
};

const operations = Object.keys(s3MethodsInfo);
const SPAN_NAME = 's3';

class InstanaAWSS3 extends InstanaAWSProduct {
  instrumentedMakeRequest(ctx, originalMakeRequest, originalArgs) {
    const self = this;
    /**
     * Original args for ALL AWS SDK Requets: [method, params, callback]
     */

    if (cls.tracingSuppressed()) {
      return originalMakeRequest.apply(ctx, originalArgs);
    }

    const parentSpan = cls.getCurrentSpan();

    if (!parentSpan || isExitSpan(parentSpan)) {
      return originalMakeRequest.apply(ctx, originalArgs);
    }

    return cls.ns.runAndReturn(() => {
      const span = cls.startSpan(SPAN_NAME, EXIT);
      span.ts = Date.now();
      span.stack = tracingUtil.getStackTrace(this.instrumentedMakeRequest, 1);
      span.data[this.spanName] = this.buildSpanData(originalArgs[0], originalArgs[1]);

      const _originalCallback = originalArgs[2];

      // callback case
      if (_originalCallback) {
        originalArgs[2] = cls.ns.bind(function (err) {
          self.finishSpan(err, span);
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

  buildSpanData(methodName, params) {
    const methodInfo = s3MethodsInfo[methodName];
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
