/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const cls = require('../../../../cls');
const { EXIT } = require('../../../../constants');
const tracingUtil = require('../../../../tracingUtil');
const { InstanaAWSProduct } = require('./instana_aws_product');

const SPAN_NAME = 'dynamodb';

class InstanaAWSDynamoDB extends InstanaAWSProduct {
  constructor() {
    super(SPAN_NAME);
  }

  instrumentedSmithySend(ctx, isActive, originalSend, smithySendArgs) {
    if (cls.skipExitTracing({ isActive })) {
      return originalSend.apply(ctx, smithySendArgs);
    }

    const command = smithySendArgs[0];
    return cls.ns.runAndReturn(() => {
      const self = this;

      const spanData = {
        [this.spanName]: this.buildSpanData(command.constructor.name, command.input)
      };
      const span = cls.startSpan({
        spanName: this.spanName,
        kind: EXIT,
        spanData
      });
      span.ts = Date.now();
      span.stack = tracingUtil.getStackTrace(this.instrumentedSmithySend, 1);
      this.captureRegion(ctx, span);

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
    const spanData = {
      operation: this.convertOperationName(operation)
    };

    if (params && params.TableName) {
      spanData.table = params.TableName;
    } else if (params && params.RequestItems) {
      spanData.table = Object.keys(params.RequestItems).toString();
    }

    return spanData;
  }

  captureRegion(ctx, span) {
    // Unfortunately the region seems to be available only via an async API. The promise should usually resolve long
    // before the actual DynamoDB call finishes and we close the span.
    if (typeof ctx.config.region === 'function') {
      const regionPromise = ctx.config.region();
      if (typeof regionPromise.then === 'function') {
        regionPromise
          .then(region => {
            span.data[this.spanName].region = region;
          })
          .catch(() => {
            /* silently ignore failed attempts to get the region */
          });
      } else {
        tracingUtil.handleUnexpectedReturnValue(regionPromise, span, this.spanName, 'config.region()');
      }
    }
  }
}

module.exports = InstanaAWSDynamoDB;
