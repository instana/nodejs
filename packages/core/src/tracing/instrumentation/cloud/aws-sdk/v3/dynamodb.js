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
  CreateTableCommand: { op: 'create' },
  DeleteTableCommand: { op: 'delete' },
  ListTablesCommand: { op: 'list' },
  ScanCommand: { op: 'scan' },
  QueryCommand: { op: 'query' },
  GetItemCommand: { op: 'get' },
  DeleteItemCommand: { op: 'delete' },
  PutItemCommand: { op: 'put' },
  UpdateItemCommand: { op: 'update' }
};

const operations = Object.keys(operationsInfo);

const SPAN_NAME = 'dynamodb';

class InstanaAWSDynamoDB extends InstanaAWSProduct {
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
