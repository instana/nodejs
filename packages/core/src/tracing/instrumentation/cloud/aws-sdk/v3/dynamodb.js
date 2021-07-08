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
  instrumentedInnerLoggerMiddleware(ctx, originalInnerLoggerMiddleware, originalInnerFuncArgs, originalParentFuncArgs) {
    const parentSpan = cls.getCurrentSpan();

    if (!parentSpan || isExitSpan(parentSpan)) {
      return originalInnerLoggerMiddleware.apply(ctx, originalInnerFuncArgs);
    }

    return cls.ns.runAndReturn(() => {
      const span = cls.startSpan(this.spanName, EXIT);
      span.ts = Date.now();
      span.stack = tracingUtil.getStackTrace(this.instrumentedInnerLoggerMiddleware);
      // Data attribs: op and table
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
