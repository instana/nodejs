/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const cls = require('../../../../cls');
const { EXIT, sqsAttributeNames } = require('../../../../constants');
const tracingUtil = require('../../../../tracingUtil');
const { InstanaAWSProduct } = require('./instana_aws_product');
const { logTooManyAttributesWarningOnce } = require('../aws_utils');

const SPAN_NAME = 'sns';
let logger;

class InstanaAWSNS extends InstanaAWSProduct {
  constructor(config) {
    logger = config.logger;
    super(SPAN_NAME);
  }

  instrumentedSmithySend(ctx, isActive, originalSend, smithySendArgs) {
    const skipTracingResult = cls.skipExitTracing({ extendedResponse: true, isActive });

    if (skipTracingResult.skip) {
      if (skipTracingResult.suppressed) {
        this.propagateSuppression(smithySendArgs[0]);
      }

      return originalSend.apply(ctx, smithySendArgs);
    }

    return cls.ns.runAndReturn(() => {
      const self = this;
      const span = cls.startSpan({
        spanName: this.spanName,
        kind: EXIT
      });
      span.ts = Date.now();
      span.stack = tracingUtil.getStackTrace(this.instrumentedSmithySend, 1);

      span.data[this.spanName] = this.buildSpanData(smithySendArgs[0]);
      this.propagateTraceContext(smithySendArgs[0], span);

      const { originalCallback, callbackIndex } = tracingUtil.findCallback(smithySendArgs);

      if (callbackIndex !== -1) {
        smithySendArgs[callbackIndex] = cls.ns.bind(function (err) {
          self.finishSpan(err, span);
          return originalCallback.apply(this, arguments);
        });

        return originalSend.apply(ctx, smithySendArgs);
      } else {
        const request = originalSend.apply(ctx, smithySendArgs);

        request
          .then(resp => {
            if (resp && resp.TopicArn) {
              span.data[this.spanName].topic = resp.TopicArn;
            }

            this.finishSpan(null, span);
          })
          .catch(err => {
            this.finishSpan(err, span);
          });

        return request;
      }
    });
  }

  buildSpanData(args) {
    const params = (args && args.input) || {};

    const spanData = {
      topic: params.TopicArn,
      subject: params.Subject,
      phone: params.PhoneNumber,
      target: params.TargetArn
    };

    return spanData;
  }

  propagateTraceContext(cmd, span) {
    if (!cmd || !cmd.input) {
      return;
    }

    if (!cmd.input.MessageAttributes) {
      cmd.input.MessageAttributes = {};
    }

    // SNS has a limit of 10 message attributes, we need to add two attributes.
    if (Object.keys(cmd.input.MessageAttributes).length >= 9) {
      logTooManyAttributesWarningOnce(logger, cmd.input.MessageAttributes, 2);
      return;
    }

    cmd.input.MessageAttributes[sqsAttributeNames.TRACE_ID] = {
      DataType: 'String',
      StringValue: span.t
    };

    cmd.input.MessageAttributes[sqsAttributeNames.SPAN_ID] = {
      DataType: 'String',
      StringValue: span.s
    };
  }

  propagateSuppression(cmd) {
    if (!cmd || !cmd.input) {
      return;
    }

    if (!cmd.input.MessageAttributes) {
      cmd.input.MessageAttributes = {};
    }

    // SNS has a limit of 10 message attributes, we need to add one attribute.
    if (Object.keys(cmd.input.MessageAttributes).length >= 10) {
      logTooManyAttributesWarningOnce(logger, cmd.input.MessageAttributes, 1);
      return;
    }

    cmd.input.MessageAttributes[sqsAttributeNames.LEVEL] = {
      DataType: 'String',
      StringValue: '0'
    };
  }
}

module.exports = InstanaAWSNS;
