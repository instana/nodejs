/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const shimmer = require('../../shimmer');

const hook = require('../../../util/hook');
const tracingUtil = require('../../tracingUtil');
const constants = require('../../constants');
const cls = require('../../cls');

let logger;
let isActive = false;

// FYI: officially deprecated. No release since 4 years. But still very
//      high usage on npm trends. We will drop it in any upcoming major release.
exports.init = function init(config) {
  logger = config.logger;

  hook.onModuleLoad('kafka-node', instrument);
};

function instrument(kafka) {
  logger.warn(
    // eslint-disable-next-line max-len
    '[Deprecation Warning] The kafka-node library is deprecated and will be removed in the next major release. Please consider migrating to an appropriate package.'
  );

  shimmer.wrap(Object.getPrototypeOf(kafka.Producer.prototype), 'send', shimSend);
  shimmer.wrap(kafka.Consumer.prototype, 'emit', shimEmit);

  if (kafka.HighLevelConsumer) {
    // kafka-node 4.0.0 dropped the HighLevelConsumer API
    shimmer.wrap(kafka.HighLevelConsumer.prototype, 'emit', shimEmit);
  } else {
    // kafka-node 4.0.0 refactored the ConsumerGroup to not longer inherit from HighLevelConsumer so it needs to be
    // shimmed explicitly
    shimmer.wrap(kafka.ConsumerGroup.prototype, 'emit', shimEmit);
  }
}

function shimSend(original) {
  return function () {
    return instrumentedSend(this, original, arguments[0], arguments[1]);
  };
}

function instrumentedSend(ctx, originalSend, produceRequests, cb) {
  const args = [produceRequests];

  // Possibly bail early
  if (cls.skipExitTracing({ isActive }) || !produceRequests || produceRequests.length === 0) {
    // restore original send args
    if (cb) {
      args.push(cb);
    }

    // kafka-node does not support headers: https://github.com/SOHU-Co/kafka-node/issues/1309
    // We cannot inject our Instana headers.

    return originalSend.apply(ctx, args);
  }

  return cls.ns.runAndReturn(() => {
    const span = cls.startSpan({
      spanName: 'kafka',
      kind: constants.EXIT
    });
    const produceRequest = produceRequests[0];
    span.b = { s: produceRequests.length };
    span.stack = tracingUtil.getStackTrace(instrumentedSend);
    span.data.kafka = {
      service: produceRequest.topic,
      access: 'send'
    };

    args.push(
      cls.ns.bind(function onSendCompleted(err) {
        if (err) {
          span.ec = 1;
          const errorValue = err.message;
          const key = 'kafka';
          span.data[key].error = errorValue;
        }

        span.d = Date.now() - span.ts;
        span.transmit();

        if (cb) {
          return cb.apply(this, arguments);
        }
      })
    );

    return originalSend.apply(ctx, args);
  });
}

function shimEmit(original) {
  return function (eventType, message) {
    if (!isActive || eventType !== 'message') {
      return original.apply(this, arguments);
    }

    const originalThis = this;
    const originalArgs = arguments;

    const parentSpan = cls.getCurrentSpan();
    if (parentSpan) {
      logger.warn(
        // eslint-disable-next-line max-len
        `Cannot start a Kafka entry span when another span is already active. Currently, the following span is active: ${JSON.stringify(
          parentSpan
        )}`
      );
      return original.apply(originalThis, originalArgs);
    }

    return cls.ns.runAndReturn(() => {
      const span = cls.startSpan({
        spanName: 'kafka',
        kind: constants.ENTRY
      });
      span.stack = [];
      span.data.kafka = {
        access: 'consume',
        service: message.topic
      };

      try {
        return original.apply(originalThis, originalArgs);
      } finally {
        setImmediate(() => {
          span.d = Date.now() - span.ts;
          span.transmit();
        });
      }
    });
  };
}

exports.activate = function activate() {
  isActive = true;
};

exports.deactivate = function deactivate() {
  isActive = false;
};
