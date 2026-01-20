/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const shimmer = require('../../../../shimmer');
const hook = require('../../../../../util/hook');
const cls = require('../../../../cls');
const tracingUtil = require('../../../../tracingUtil');

function init() {
  hook.onModuleLoad('sqs-consumer', instrument);
}

function instrument(SQSConsumer) {
  shimmer.wrap(SQSConsumer.Consumer.prototype, 'executeHandler', function (orig) {
    return function instanaExecuteHandler() {
      const message = arguments[0];

      if (message && message.instanaAsyncContext) {
        return cls.runInAsyncContext(message.instanaAsyncContext, () => {
          const span = cls.getCurrentSpan();
          span.disableAutoEnd();
          const res = orig.apply(this, arguments);

          if (res && typeof res.then === 'function') {
            res
              .then(() => {
                span.d = Date.now() - span.ts;
                span.transmitManual();
              })
              .catch(err => {
                span.ec = 1;
                tracingUtil.setErrorDetails(span, err, 'sqs');
                span.d = Date.now() - span.ts;
                span.transmitManual();
              });
          }

          return res;
        });
      }

      return orig.apply(this, arguments);
    };
  });

  shimmer.wrap(SQSConsumer.Consumer.prototype, 'executeBatchHandler', function (orig) {
    return function instanaExecuteBatchHandler() {
      const messages = arguments[0];

      if (messages) {
        const message = messages.find(msg => msg.instanaAsyncContext);

        return cls.runInAsyncContext(message.instanaAsyncContext, () => {
          const span = cls.getCurrentSpan();
          span.disableAutoEnd();
          const res = orig.apply(this, arguments);

          if (res && typeof res.then === 'function') {
            res
              .then(() => {
                span.d = Date.now() - span.ts;
                span.transmitManual();
              })
              .catch(err => {
                span.ec = 1;
                tracingUtil.setErrorDetails(span, err, 'sqs');
                span.d = Date.now() - span.ts;
                span.transmitManual();
              });
          }

          return res;
        });
      }
      return orig.apply(this, arguments);
    };
  });
}

module.exports = {
  init
};
