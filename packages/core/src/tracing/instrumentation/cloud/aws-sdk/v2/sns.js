/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const cls = require('../../../../cls');
const { EXIT, isExitSpan, sqsAttributeNames } = require('../../../../constants');
const tracingUtil = require('../../../../tracingUtil');
const { InstanaAWSProduct } = require('./instana_aws_product');

/**
 * We only instrument publish() for now.
 * This more dynamic structure is being kept for future instrumentations, most probably administrative methods, like
 * createTopic(), etc.
 */
const operationsInfo = {
  publish: {}
};

const operations = Object.keys(operationsInfo);
const SPAN_NAME = 'sns';

class InstanaAWSSNS extends InstanaAWSProduct {
  instrumentedMakeRequest(ctx, originalMakeRequest, originalArgs) {
    const parentSpan = cls.getCurrentSpan();
    const messageBody = originalArgs[1];

    if (!messageBody.MessageAttributes) {
      messageBody.MessageAttributes = {};
    }

    if (!parentSpan || isExitSpan(parentSpan)) {
      return originalMakeRequest.apply(ctx, originalArgs);
    }

    if (cls.tracingSuppressed()) {
      this.propagateSuppression(messageBody.MessageAttributes);
      return originalMakeRequest.apply(ctx, originalArgs);
    }

    return cls.ns.runAndReturn(() => {
      const self = this;
      const span = cls.startSpan(this.spanName, EXIT);
      span.ts = Date.now();
      span.stack = tracingUtil.getStackTrace(this.instrumentedMakeRequest, 1);
      span.data[this.spanName] = this.buildSpanData(originalArgs[1]);

      this.propagateTraceContext(messageBody.MessageAttributes, span);

      if (typeof originalArgs[2] === 'function') {
        // callback case
        const _originalCallback = originalArgs[2];

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

  buildSpanData(params) {
    const spanData = {
      topic: params.TopicArn,
      subject: params.Subject,
      phone: params.PhoneNumber,
      target: params.TargetArn
    };

    return spanData;
  }

  propagateTraceContext(attributes, span) {
    if (!attributes || typeof attributes !== 'object') {
      return;
    }

    attributes[sqsAttributeNames.TRACE_ID] = {
      DataType: 'String',
      StringValue: span.t
    };

    attributes[sqsAttributeNames.SPAN_ID] = {
      DataType: 'String',
      StringValue: span.s
    };

    attributes[sqsAttributeNames.LEVEL] = {
      DataType: 'String',
      StringValue: '1'
    };
  }

  propagateSuppression(attributes) {
    if (!attributes || typeof attributes !== 'object') {
      return;
    }

    attributes[sqsAttributeNames.LEVEL] = {
      DataType: 'String',
      StringValue: '0'
    };
  }
}

module.exports = new InstanaAWSSNS(SPAN_NAME, operations);
