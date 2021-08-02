/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const shimmer = require('shimmer');
const cls = require('../../../../cls');
const {
  configureEntrySpan,
  hasTracingAttributes,
  readTracingAttributesFromSns,
  readTracingAttributes
} = require('../aws_utils');
const { ENTRY, EXIT, isExitSpan, sqsAttributeNames } = require('../../../../constants');
const requireHook = require('../../../../../util/requireHook');
const tracingUtil = require('../../../../tracingUtil');

// Available call types to be sent into span.data.sqs.type
const callTypes = {
  CREATE_QUEUE: 'create.queue',
  GET_QUEUE: 'get.queue',
  SEND_MESSAGE: 'single.sync',
  SEND_MESSAGE_BATCH: 'batch.sync',
  DELETE_MESSAGE: 'delete.single.sync',
  DELETE_MESSAGE_BATCH: 'delete.batch.sync'
};

const sortTypes = {
  ENTRY: 'entry',
  EXIT: 'exit'
};

let logger = require('../../../../../logger').getLogger('tracing/sqs', newLogger => {
  logger = newLogger;
});

let isActive = false;

exports.init = function init() {
  requireHook.onModuleLoad('aws-sdk', instrumentSQS);
  requireHook.onModuleLoad('sqs-consumer', instrumentSQSConsumer);
};

function instrumentSQS(AWS) {
  // /aws-sdk/lib/service.js#defineMethods
  shimmer.wrap(AWS.Service, 'defineMethods', function (original) {
    return function (svc) {
      const patchedMethod = original.apply(this, arguments);

      if (
        svc &&
        svc.prototype &&
        typeof svc.prototype.serviceIdentifier === 'string' &&
        svc.prototype.serviceIdentifier.toLowerCase() === 'sqs'
      ) {
        shimmer.wrap(svc.prototype, 'sendMessage', shimSendMessage);
        shimmer.wrap(svc.prototype, 'sendMessageBatch', shimSendMessage);
        shimmer.wrap(svc.prototype, 'receiveMessage', shimReceiveMessage);
      }

      return patchedMethod;
    };
  });
}

function shimSendMessage(originalSendMessage) {
  return function () {
    if (isActive) {
      const originalArgs = new Array(arguments.length);
      for (let i = 0; i < originalArgs.length; i++) {
        originalArgs[i] = arguments[i];
      }

      return instrumentedSendMessage(this, originalSendMessage, originalArgs);
    }

    return originalSendMessage.apply(this, arguments);
  };
}

function instrumentedSendMessage(ctx, originalSendMessage, originalArgs) {
  /**
   * Send Message Attribues format
   * {
   *    ...
   *    MessageAttributes: {
   *      CustomAttribute: {
   *        DataType: 'String',
   *        StringValue: 'Custom Value'
   *      }
   *    }
   * }
   */
  const messageData = originalArgs[0];

  if (!messageData) {
    return originalSendMessage.apply(ctx, originalArgs);
  }

  let attributes;
  const isBatch = messageData.Entries && messageData.Entries.length > 0;

  if (isBatch) {
    messageData.Entries.forEach(entry => {
      if (!entry.MessageAttributes) {
        entry.MessageAttributes = {};
      }
    });
  } else {
    attributes = messageData.MessageAttributes;
  }

  if (!attributes && !isBatch) {
    attributes = messageData.MessageAttributes = {};
  }

  if (cls.tracingSuppressed()) {
    if (isBatch) {
      messageData.Entries.forEach(entry => {
        propagateSuppression(entry.MessageAttributes);
      });
    } else {
      propagateSuppression(attributes);
    }
    return originalSendMessage.apply(ctx, originalArgs);
  }

  const parentSpan = cls.getCurrentSpan();

  if (!parentSpan || isExitSpan(parentSpan)) {
    return originalSendMessage.apply(ctx, originalArgs);
  }

  return cls.ns.runAndReturn(() => {
    const span = cls.startSpan('sqs', EXIT);
    span.ts = Date.now();
    span.stack = tracingUtil.getStackTrace(instrumentedSendMessage);
    span.data.sqs = {
      sort: sortTypes.EXIT,
      type: messageData.Entries ? callTypes.SEND_MESSAGE_BATCH : callTypes.SEND_MESSAGE,
      group: messageData.MessageGroupId,
      queue: originalArgs[0].QueueUrl || ''
    };

    if (isBatch) {
      span.data.sqs.size = messageData.Entries.length;
      messageData.Entries.forEach(entry => {
        propagateTraceContext(entry.MessageAttributes, span);
      });
    } else {
      propagateTraceContext(attributes, span);
    }

    const originalCallback = originalArgs[1];
    if (typeof originalCallback === 'function') {
      originalArgs[1] = cls.ns.bind(function (err, data) {
        finishSpan(err, data, span);
        originalCallback.apply(this, arguments);
      });
    }

    const awsRequest = originalSendMessage.apply(ctx, originalArgs);

    if (typeof awsRequest.promise === 'function') {
      awsRequest.promise = cls.ns.bind(awsRequest.promise);
    }

    // this is what the promise actually does
    awsRequest.on('complete', function onComplete(data) {
      if (data && data.error) {
        finishSpan(data.error, null, span);
        throw data.error;
      } else {
        finishSpan(null, data, span);
        return data;
      }
    });

    return awsRequest;
  });
}

function propagateSuppression(attributes) {
  if (!attributes || typeof attributes !== 'object') {
    return;
  }

  attributes[sqsAttributeNames.LEVEL] = {
    DataType: 'String',
    StringValue: '0'
  };
}

function propagateTraceContext(attributes, span) {
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

function shimReceiveMessage(originalReceiveMessage) {
  return function () {
    if (isActive) {
      const parentSpan = cls.getCurrentSpan();
      if (parentSpan) {
        logger.warn(
          // eslint-disable-next-line max-len
          `Cannot start an AWS SQS entry span when another span is already active. Currently, the following span is active: ${JSON.stringify(
            parentSpan
          )}`
        );
        return originalReceiveMessage.apply(this, arguments);
      }

      const originalArgs = new Array(arguments.length);
      for (let i = 0; i < originalArgs.length; i++) {
        originalArgs[i] = arguments[i];
      }
      return instrumentedReceiveMessage(this, originalReceiveMessage, originalArgs);
    }

    return originalReceiveMessage.apply(this, arguments);
  };
}

function instrumentedReceiveMessage(ctx, originalReceiveMessage, originalArgs) {
  return cls.ns.runAndReturn(() => {
    const span = cls.startSpan('sqs', ENTRY);
    span.stack = tracingUtil.getStackTrace(instrumentedSendMessage);
    span.data.sqs = {
      sort: sortTypes.ENTRY,
      queue: originalArgs[0].QueueUrl || ''
    };

    /**
     * The MessageAttributeNames attribute is an option that you tell which message attributes you want to see.
     * As we use message attributes to store Instana headers, if the customer does not set this attribute to All,
     * we cannot see the Instana headers, so we need to explicitly add them.
     */
    const receveingParams = originalArgs[0];

    if (!receveingParams.MessageAttributeNames) {
      receveingParams.MessageAttributeNames = [];
    }

    if (
      !receveingParams.MessageAttributeNames.includes('X_INSTANA*') &&
      !receveingParams.MessageAttributeNames.includes('All')
    ) {
      receveingParams.MessageAttributeNames.push('X_INSTANA*');
    }

    // callback use case
    const originalCallback = originalArgs[1];
    if (typeof originalCallback === 'function') {
      originalArgs[1] = cls.ns.bind(function (err, data) {
        if (err) {
          addErrorToSpan(err, span);
          setImmediate(() => finishSpan(null, null, span));
          return originalCallback.apply(this, arguments);
        } else if (data && data.error) {
          addErrorToSpan(data.err, span);
          setImmediate(() => finishSpan(null, null, span));
          return originalCallback.apply(this, arguments);
        } else if (data && data.Messages && data.Messages.length > 0) {
          let tracingAttributes = readTracingAttributes(data.Messages[0].MessageAttributes);
          if (!hasTracingAttributes(tracingAttributes)) {
            tracingAttributes = readTracingAttributesFromSns(data.Messages[0].Body);
          }
          if (tracingAttributes.level === '0') {
            cls.setTracingLevel('0');
            setImmediate(() => span.cancel());
            return originalCallback.apply(this, arguments);
          }

          configureEntrySpan(span, data, tracingAttributes);
          setImmediate(() => finishSpan(null, data, span));
          return originalCallback.apply(this, arguments);
        } else {
          setImmediate(() => span.cancel());
          return originalCallback.apply(this, arguments);
        }
      });
    }

    const awsRequest = originalReceiveMessage.apply(ctx, originalArgs);

    // promise use case
    if (typeof awsRequest.promise === 'function' && typeof originalCallback !== 'function') {
      const originalPromiseFn = awsRequest.promise;
      awsRequest.promise = cls.ns.bind(function () {
        const promise = originalPromiseFn.apply(awsRequest, arguments);

        promise.then(
          data => {
            if (data && data.error) {
              addErrorToSpan(data.error, span);
              setImmediate(() => finishSpan(null, null, span));
              return data;
            } else if (data && data.Messages && data.Messages.length > 0) {
              let tracingAttributes = readTracingAttributes(data.Messages[0].MessageAttributes);
              if (!hasTracingAttributes(tracingAttributes)) {
                tracingAttributes = readTracingAttributesFromSns(data.Messages[0].Body);
              }

              if (tracingAttributes.level === '0') {
                cls.setTracingLevel('0');
                setImmediate(() => span.cancel());
                return data;
              }

              configureEntrySpan(span, data, tracingAttributes);
              setImmediate(() => finishSpan(null, data, span));
            } else {
              setImmediate(() => span.cancel());
            }
            return data;
          },
          error => {
            addErrorToSpan(error, span);
            setImmediate(() => finishSpan(null, null, span));
            throw error;
          }
        );

        promise.instanaAsyncContext = cls.getAsyncContext();
        if (originalArgs[0] && originalArgs[0].QueueUrl) {
          ctx[originalArgs[0].QueueUrl] = promise.instanaAsyncContext;
        }

        // Usually, native promises are handled automatically, that is, their then/catch/finally is executed in the CLS
        // context they have been created in. Apparently, here the promise is created outside the CLS context, thus we
        // bind the handlers manually.
        promise.then = cls.ns.bind(promise.then);
        if (promise.catch) {
          promise.catch = cls.ns.bind(promise.catch);
        }
        if (promise.finally) {
          promise.finally = cls.ns.bind(promise.finally);
        }
        return promise;
      });
    }

    return awsRequest;
  });
}

function finishSpan(err, data, span) {
  if (err) {
    addErrorToSpan(err, span);
  }
  if (typeof data === 'string') {
    span.data.sqs.messageId = data;
  }

  span.d = Date.now() - span.ts;
  span.transmit();
}

function addErrorToSpan(err, span) {
  if (err) {
    span.ec = 1;
    span.data.sqs.error = err.message || err.code || JSON.stringify(err);
  }
}

exports.activate = function activate() {
  isActive = true;
};

exports.deactivate = function deactivate() {
  isActive = false;
};

/* *********** SQS Consumer ************** */

function instrumentSQSConsumer(SQSConsumer) {
  shimmer.wrap(SQSConsumer.Consumer.prototype, 'receiveMessage', shimSQSConsumerReceiveMessage);
  shimmer.wrap(SQSConsumer.Consumer.prototype, 'executeHandler', shimSQSConsumerExecuteHandler);
  shimmer.wrap(SQSConsumer.Consumer.prototype, 'executeBatchHandler', shimSQSConsumerExecuteHandler);
}

function shimSQSConsumerExecuteHandler(original) {
  return function () {
    if (isActive) {
      const originalArgs = new Array(arguments.length);
      for (let i = 0; i < originalArgs.length; i++) {
        originalArgs[i] = arguments[i];
      }

      return instrumentedSQSConsumerExecuteHandler(this, original, originalArgs);
    }

    return original.apply(this, arguments);
  };
}

function instrumentedSQSConsumerExecuteHandler(ctx, original, originalArgs) {
  const instanaAsyncContext = ctx.sqs[ctx._instanaSqsQueueUrl];
  delete ctx.sqs[ctx._instanaSqsQueueUrl];
  if (instanaAsyncContext) {
    return cls.runInAsyncContext(instanaAsyncContext, () => {
      const span = cls.getCurrentSpan();
      span.disableAutoEnd();
      const res = original
        .apply(ctx, originalArgs)
        .then(data => {
          span.d = Date.now() - span.ts;
          span.transmitManual();
          return data;
        })
        .catch(err => {
          addErrorToSpan(err, span);
          span.d = Date.now() - span.ts;
          span.transmitManual();
        });
      return res;
    });
  } else {
    return original.apply(ctx, originalArgs);
  }
}

function shimSQSConsumerReceiveMessage(original) {
  return function () {
    if (isActive) {
      const originalArgs = new Array(arguments.length);
      for (let i = 0; i < originalArgs.length; i++) {
        originalArgs[i] = arguments[i];
      }

      return instrumentedSQSConsumerReceiveMessage(this, original, originalArgs);
    }

    return original.apply(this, arguments);
  };
}

function instrumentedSQSConsumerReceiveMessage(ctx, original, originalArgs) {
  return cls.ns.runAndReturn(() => {
    // save the queue url to be used in executeHandler
    ctx._instanaSqsQueueUrl = originalArgs[0].QueueUrl;
    return original.apply(ctx, originalArgs);
  });
}
