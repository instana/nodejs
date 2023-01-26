/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const shimmer = require('shimmer');
const requireHook = require('../../../../../util/requireHook');
const cls = require('../../../../cls');

function init() {
  requireHook.onModuleLoad('sqs-consumer', instrument);
}

function instrument(SQSConsumer) {
  shimmer.wrap(SQSConsumer.Consumer.prototype, 'executeHandler', function (orig) {
    return function instanaExecuteHandler() {
      const message = arguments[0];

      if (message && message.instanaAsyncContext) {
        return cls.runInAsyncContext(message.instanaAsyncContext, () => {
          const span = cls.getCurrentSpan();
          span.disableAutoEnd();

          delete arguments[0].instanaAsyncContext;
          const res = orig.apply(this, arguments);

          res
            .then(() => {
              span.d = Date.now() - span.ts;
              span.transmitManual();
            })
            .catch(err => {
              span.ec = 1;
              span.data.sqs.error = err.message || err.code || JSON.stringify(err);
              span.d = Date.now() - span.ts;
              span.transmitManual();
            });

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
