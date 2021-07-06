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
  createTable: { op: 'create' },
  // deleteTable: { op: 'delete' },
  listTables: { op: 'list' },
  scan: { op: 'scan' },
  query: { op: 'query' },
  getItem: { op: 'get' },
  deleteItem: { op: 'delete' },
  putItem: { op: 'put' },
  updateItem: { op: 'update' }
};

const operations = Object.keys(operationsInfo);

const SPAN_NAME = 'dynamodb';

class InstanaAWSDynamoDB extends InstanaAWSProduct {
  instrumentedMakeRequest(ctx, originalMakeRequest, originalArgs) {
    const parentSpan = cls.getCurrentSpan();

    if (!parentSpan || isExitSpan(parentSpan)) {
      return originalMakeRequest.apply(ctx, originalArgs);
    }

    return cls.ns.runAndReturn(() => {
      const self = this;
      const span = cls.startSpan(this.spanName, EXIT);
      span.ts = Date.now();
      span.stack = tracingUtil.getStackTrace(this.instrumentedMakeRequest, 1);
      // Data attribs: op and table
      span.data[this.spanName] = this.buildSpanData(originalArgs[0], originalArgs[1]);

      if (typeof originalArgs[2] === 'function') {
        // callback case
        const _originalCallback = originalArgs[2];

        originalArgs[2] = cls.ns.bind(function (err, data) {
          /**
           * DynamoDB can send error data as a successful HTTP response.
           * In this case, the payload should include a code and a statusCode property. eg:
           * {
           *   "message": "Requested resource not found",
           *   "code": "ResourceNotFoundException",
           *   "time": "2021-02-24T13:58:38.795Z",
           *   "requestId": "PK31CEJ8037HMRUBL8A3JUHQBNVV4KQNSO5AEMVJF66Q9ASUAAJG",
           *   "statusCode": 400,
           *   "retryable": false,
           *   "retryDelay": 3.0853515398627462
           * }
           */

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

    if (params && params.TableName) {
      spanData.table = params.TableName;
    }

    return spanData;
  }
}

module.exports = new InstanaAWSDynamoDB(SPAN_NAME, operations);
