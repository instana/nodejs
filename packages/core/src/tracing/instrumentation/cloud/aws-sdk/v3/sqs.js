/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const cls = require('../../../../cls');
const {
  configureEntrySpan,
  hasTracingAttributes,
  logTooManyAttributesWarningOnce,
  readTracingAttributesFromSns,
  readTracingAttributes
} = require('../aws_utils');
const { ENTRY, EXIT, sqsAttributeNames } = require('../../../../constants');
const tracingUtil = require('../../../../tracingUtil');
const { InstanaAWSProduct } = require('./instana_aws_product');
let logger = require('../../../../../logger').getLogger('tracing/sqs/v3', newLogger => {
  logger = newLogger;
});

const operationsInfo = {
  SendMessageBatchCommand: {
    sort: 'exit',
    type: 'batch.sync'
  },
  SendMessageCommand: {
    sort: 'exit',
    type: 'single.sync'
  },
  ReceiveMessageCommand: {
    sort: 'entry'
  }
};

const operations = Object.keys(operationsInfo);

const SPAN_NAME = 'sqs';

class InstanaAWSSQS extends InstanaAWSProduct {
  init(hook, shimmer) {
    // < 3.481.0
    // refs https://github.com/instana/nodejs/commit/6ae90e74fee5c47cc4ade67d21c4885d34c08847
    // Background: sqs.receiveMessage returned a different promise than smithy.send (which is called internally)
    hook.onFileLoad(/@aws-sdk\/client-sqs\/dist-cjs\/SQS\.js/, function (module) {
      shimmer.wrap(module.SQS.prototype, 'receiveMessage', function (originalReceiveMsgFn) {
        return function instanaReceiveMessage() {
          return cls.ns.runAndReturn(() => {
            const ctx = cls.getAsyncContext();
            this._instanaCtx = ctx;
            const promise = originalReceiveMsgFn.apply(this, arguments);

            promise.then = cls.ns.bind(promise.then);

            if (promise.catch) {
              promise.catch = cls.ns.bind(promise.catch);
            }
            if (promise.finally) {
              promise.finally = cls.ns.bind(promise.finally);
            }

            return promise;
          });
        };
      });
    });

    // >= 3.481
    // https://github.com/aws/aws-sdk-js-v3/pull/5604
    hook.onFileLoad(/@aws-sdk\/client-sqs\/dist-cjs\/index\.js/, function (module) {
      shimmer.wrap(module.SQS.prototype, 'receiveMessage', function (originalReceiveMsgFn) {
        return function instanaReceiveMessage() {
          return cls.ns.runAndReturn(() => {
            const ctx = cls.getAsyncContext();
            this._instanaCtx = ctx;
            const promise = originalReceiveMsgFn.apply(this, arguments);

            promise.then = cls.ns.bind(promise.then);

            if (promise.catch) {
              promise.catch = cls.ns.bind(promise.catch);
            }
            if (promise.finally) {
              promise.finally = cls.ns.bind(promise.finally);
            }

            return promise;
          });
        };
      });
    });
  }

  instrumentedSmithySend(ctx, isActive, originalSend, smithySendArgs) {
    const commandName = smithySendArgs[0].constructor.name;
    const operation = operationsInfo[commandName];

    if (operation && operation.sort === 'exit') {
      return this.instrumentExit(ctx, isActive, originalSend, smithySendArgs, operation);
    } else if (operation && operation.sort === 'entry') {
      return this.instrumentEntry(ctx, originalSend, smithySendArgs, operation);
    }

    return originalSend.apply(ctx, smithySendArgs);
  }

  instrumentExit(ctx, isActive, originalSend, smithySendArgs, operation) {
    const command = smithySendArgs[0];
    const sendMessageInput = command.input;

    /**
     * Send Message Attribues format
     *  MessageAttributes: {
     *    CustomAttribute: {
     *      DataType: 'String',
     *      StringValue: 'Custom Value'
     *    }
     *  }
     */

    let attributes;
    const isBatch = sendMessageInput.Entries && sendMessageInput.Entries.length > 0;

    // Make sure that MessageAttributes is an existent object
    if (isBatch) {
      sendMessageInput.Entries.forEach(entry => {
        if (!entry.MessageAttributes) {
          entry.MessageAttributes = {};
        }
      });
    } else {
      attributes = sendMessageInput.MessageAttributes;
    }

    if (!attributes && !isBatch) {
      attributes = sendMessageInput.MessageAttributes = {};
    }

    const skipTracingResult = cls.skipExitTracing({ extendedResponse: true, isActive });

    if (skipTracingResult.skip) {
      if (skipTracingResult.suppressed) {
        if (isBatch) {
          sendMessageInput.Entries.forEach(entry => {
            this.propagateSuppression(entry.MessageAttributes);
          });
        } else {
          this.propagateSuppression(attributes);
        }
      }

      return originalSend.apply(ctx, smithySendArgs);
    }

    return cls.ns.runAndReturn(() => {
      const self = this;
      const span = cls.startSpan(SPAN_NAME, EXIT);
      span.ts = Date.now();
      span.stack = tracingUtil.getStackTrace(this.instrumentExit, 2);
      span.data.sqs = this.buildSpanData(operation, sendMessageInput);

      if (isBatch) {
        span.data.sqs.size = sendMessageInput.Entries.length;
        sendMessageInput.Entries.forEach(entry => {
          this.propagateTraceContext(entry.MessageAttributes, span);
        });
      } else {
        this.propagateTraceContext(attributes, span);
      }

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
          .then(data => {
            if (data && data.error) {
              this.finishSpan(data.error, span);
            } else {
              this.finishSpan(null, span);
            }
          })
          .catch(err => {
            this.finishSpan(err, span);
          });

        return request;
      }
    });
  }

  instrumentEntry(ctx, originalSend, smithySendArgs, operation) {
    const parentSpan = cls.getCurrentSpan();
    if (parentSpan) {
      logger.warn(
        // eslint-disable-next-line max-len
        `Cannot start an AWS SQS entry span when another span is already active. Currently, the following span is active: ${JSON.stringify(
          parentSpan
        )}`
      );
      return originalSend.apply(ctx, smithySendArgs);
    }

    const command = smithySendArgs[0];
    const sendMessageInput = command.input;

    // Note: we pass in ctx._instanaCtx as the second parameter to runAndReturn which will run the function in the
    // context belonging to this SQS promise.
    return cls.ns.runAndReturn(() => {
      const self = this;

      const span = cls.startSpan(SPAN_NAME, ENTRY);
      span.stack = tracingUtil.getStackTrace(this.instrumentEntry, 2);
      span.data.sqs = this.buildSpanData(operation, sendMessageInput);

      /**
       * The MessageAttributeNames attribute is an option that you tell which message attributes you want to see.
       * As we use message attributes to store Instana headers, if the customer does not set this attribute to All,
       * we cannot see the Instana headers, so we need to explicitly add them.
       */
      if (!sendMessageInput.MessageAttributeNames) {
        sendMessageInput.MessageAttributeNames = [];
      }

      if (
        !sendMessageInput.MessageAttributeNames.includes('X_INSTANA*') &&
        !sendMessageInput.MessageAttributeNames.includes('All')
      ) {
        sendMessageInput.MessageAttributeNames.push('X_INSTANA*');
      }

      if (typeof smithySendArgs[1] === 'function') {
        const _callback = smithySendArgs[1];

        smithySendArgs[1] = cls.ns.bind(function (err, data) {
          if (err) {
            _callback.apply(this, arguments);
            self.addErrorToSpan(data.error, span);
            setImmediate(() => self.finishSpan(null, span));
          } else {
            if (data && data.error) {
              self.addErrorToSpan(data.error, span);
              setImmediate(() => self.finishSpan(null, span));
            } else if (data && data.Messages && data.Messages.length > 0) {
              const messages = data.Messages;

              let tracingAttributes = readTracingAttributes(messages[0].MessageAttributes);
              if (!hasTracingAttributes(tracingAttributes)) {
                tracingAttributes = readTracingAttributesFromSns(messages[0].Body);
              }

              if (tracingAttributes.level === '0') {
                cls.setTracingLevel('0');
                setImmediate(() => span.cancel());
                _callback.apply(self, arguments);
                return;
              }

              configureEntrySpan(span, data, tracingAttributes);
              setImmediate(() => {
                self.finishSpan(null, span);
              });
            } else {
              // No messages have been received. The assumption is that no follow-up activities will occur, but polling
              // for messages might be triggered again in the same event loop tick. Thus we also need to cancel the span
              // _synchronously_ in the same event loop tick. See commit message for details.
              span.cancel();
            }

            _callback.apply(self, arguments);
          }
        });

        return originalSend.apply(ctx, smithySendArgs);
      } else {
        const request = originalSend.apply(ctx, smithySendArgs);

        // NOTE: This is promise chain for the "send" method from @awsk-sdk/smithy-client, not from sqs-consumer!
        request
          .then(data => {
            if (data && data.error) {
              this.addErrorToSpan(data.error, span);
              setImmediate(() => this.finishSpan(null, span));
            } else if (data && data.Messages && data.Messages.length > 0) {
              const messages = data.Messages;
              let tracingAttributes = readTracingAttributes(messages[0].MessageAttributes);
              if (!hasTracingAttributes(tracingAttributes)) {
                tracingAttributes = readTracingAttributesFromSns(messages[0].Body);
              }
              if (tracingAttributes.level === '0') {
                cls.setTracingLevel('0');
                setImmediate(() => span.cancel());
                return data;
              }

              configureEntrySpan(span, data, tracingAttributes);

              setImmediate(() => {
                this.finishSpan(null, span);
              });
            } else {
              // No messages have been received. The assumption is that no follow-up activities will occur, but polling
              // for messages might be triggered again in the same event loop tick. Thus we also need to cancel the span
              // _synchronously_ in the same event loop tick. See commit message for details.
              span.cancel();
            }

            // NOTE: attach the async context to the last message to be able to
            //       finish the span with the correct end time and error in the sqs-consuemr `handleMessage` function.
            // 1x ReceiveMessageCommand with multiple messages (batchSize>1) == 1 sqs entry with size 4
            if (data && data.Messages && data.Messages) {
              data.Messages[data.Messages.length - 1].instanaAsyncContext = cls.getAsyncContext();
            }

            return data;
          })
          .catch(err => {
            this.addErrorToSpan(err, span);
            setImmediate(() => this.finishSpan(null, span));
            return err;
          });

        request.then = cls.ns.bind(request.then);
        if (request.catch) {
          request.catch = cls.ns.bind(request.catch);
        }
        if (request.finally) {
          request.finally = cls.ns.bind(request.finally);
        }

        return request;
      }
    }, ctx._instanaCtx);
  }

  buildSpanData(operation, sendMessageInput) {
    return {
      sort: operation.sort,
      type: operation.type,
      // This parameter applies only to FIFO (first-in-first-out) queues.
      group: sendMessageInput.MessageGroupId,
      queue: sendMessageInput.QueueUrl
    };
  }

  propagateSuppression(attributes) {
    if (!attributes || typeof attributes !== 'object') {
      return;
    }

    // SQS has a limit of 10 message attributes, we would need to add one attribute.
    if (Object.keys(attributes).length >= 10) {
      logTooManyAttributesWarningOnce(logger, attributes, 1);
      return;
    }

    attributes[sqsAttributeNames.LEVEL] = {
      DataType: 'String',
      StringValue: '0'
    };
  }

  propagateTraceContext(attributes, span) {
    if (!attributes || typeof attributes !== 'object') {
      return;
    }

    // SQS has a limit of 10 message attributes, we need to add two attributes.
    if (Object.keys(attributes).length >= 9) {
      logTooManyAttributesWarningOnce(logger, attributes, 2);
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
  }
}

module.exports = new InstanaAWSSQS(SPAN_NAME, operations);
