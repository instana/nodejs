/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const shimmer = require('shimmer');

const cls = require('../../../cls');
const {
  traceIdHeaderNameLowerCase,
  spanIdHeaderNameLowerCase,
  traceLevelHeaderNameLowerCase,
  ENTRY,
  EXIT,
  isExitSpan
} = require('../../../constants');
const requireHook = require('../../../../util/requireHook');
const tracingUtil = require('../../../tracingUtil');

let logger;
logger = require('../../../../logger').getLogger('tracing/pubsub', newLogger => {
  logger = newLogger;
});

const subscriptionRegex = /^projects\/([^/]+)\/subscriptions\/(.+)$/;

let isActive = false;

exports.init = function init() {
  requireHook.onFileLoad(/\/@google-cloud\/pubsub\/build\/src\/publisher\/index.js/, instrumentPublisher);
  requireHook.onFileLoad(/\/@google-cloud\/pubsub\/build\/src\/subscriber.js/, instrumentSubscriber);
};

function instrumentPublisher(publisher) {
  // Due to a cyclic dependency
  // (publisher/index => publisher/message-queues => publisher/message-batch => publisher/index), publisher is not fully
  // initialized when it is returned by require.
  process.nextTick(() => {
    if (!publisher || !publisher.Publisher) {
      return;
    }
    instrumentConstructor(publisher, 'Publisher', 'publishMessage', shimPublishMessage);
  });
}

function instrumentSubscriber(subscriber) {
  if (!subscriber || !subscriber.Subscriber) {
    return;
  }

  instrumentConstructor(subscriber, 'Subscriber', 'emit', shimSubscriberEmit);
}

function instrumentConstructor(module, constructorAttribute, methodAttribue, shimmedMethod) {
  const OriginalConstructor = module[constructorAttribute];
  module[constructorAttribute] = function () {
    const newInstance = new OriginalConstructor(...arguments);
    shimmer.wrap(newInstance, methodAttribue, shimmedMethod);
    return newInstance;
  };
}

function shimPublishMessage(originalFunction) {
  return function () {
    if (isActive) {
      const originalArgs = new Array(arguments.length);
      for (let i = 0; i < arguments.length; i++) {
        originalArgs[i] = arguments[i];
      }
      return instrumentedPublishMessage(this, originalFunction, originalArgs);
    }
    return originalFunction.apply(this, arguments);
  };
}

function instrumentedPublishMessage(ctx, originalPublishMessage, originalArgs) {
  const message = originalArgs[0];
  let attributes = message.attributes;
  if (!attributes) {
    attributes = message.attributes = {};
  }

  if (cls.tracingSuppressed()) {
    propagateSuppression(attributes);
  }

  const parentSpan = cls.getCurrentSpan();

  if (!parentSpan || isExitSpan(parentSpan)) {
    return originalPublishMessage.apply(ctx, originalArgs);
  }

  return cls.ns.runAndReturn(() => {
    const span = cls.startSpan('gcps', EXIT);
    span.ts = Date.now();
    span.stack = tracingUtil.getStackTrace(instrumentedPublishMessage);
    span.data.gcps = {
      op: 'publish',
      projid: ctx.topic && (ctx.topic.parent || ctx.topic.pubsub || {}).projectId,
      top: unqualifyName(ctx.topic && ctx.topic.name),
      messageId: message.id
    };

    propagateTraceContext(attributes, span);

    const originalCallback = originalArgs[1];
    if (typeof originalCallback === 'function') {
      originalArgs[1] = cls.ns.bind(function (err, messageId) {
        finishSpan(err, messageId, span);
        originalCallback.apply(this, arguments);
      });
    }

    const thenable = originalPublishMessage.apply(ctx, originalArgs);
    if (thenable && typeof thenable.then === 'function') {
      return thenable.then(
        messageId => {
          finishSpan(null, messageId, span);
          return messageId;
        },
        err => {
          finishSpan(err, null, span);
          throw err;
        }
      );
    }
    return thenable;
  });
}

function propagateSuppression(attributes) {
  if (!attributes || typeof attributes !== 'object') {
    return;
  }
  attributes[traceLevelHeaderNameLowerCase] = '0';
}

function propagateTraceContext(attributes, span) {
  if (!attributes || typeof attributes !== 'object') {
    return;
  }
  attributes[traceIdHeaderNameLowerCase] = span.t;
  attributes[spanIdHeaderNameLowerCase] = span.s;
  attributes[traceLevelHeaderNameLowerCase] = '1';
}

function shimSubscriberEmit(originalEmit) {
  return function (type) {
    if (type !== 'message' || !isActive) {
      return originalEmit.apply(this, arguments);
    }

    const parentSpan = cls.getCurrentSpan();
    if (parentSpan) {
      logger.warn(
        // eslint-disable-next-line max-len
        `Cannot start a Google Cloud PubSub entry span when another span is already active. Currently, the following span is active: ${JSON.stringify(
          parentSpan
        )}`
      );
      return originalEmit.apply(this, arguments);
    }
    const originalArgs = new Array(arguments.length);
    for (let i = 0; i < arguments.length; i++) {
      originalArgs[i] = arguments[i];
    }
    return instrumentedEmitMessage(this, originalEmit, originalArgs);
  };
}

function instrumentedEmitMessage(ctx, originalEmit, originalArgs) {
  const message = originalArgs[1];
  if (!message || typeof message !== 'object') {
    return originalEmit.apply(ctx, originalArgs);
  }

  const attribtes = message.attributes || {};

  return cls.ns.runAndReturn(() => {
    if (tracingUtil.readAttribCaseInsensitive(attribtes, traceLevelHeaderNameLowerCase) === '0') {
      cls.setTracingLevel('0');
      return originalEmit.apply(ctx, originalArgs);
    }

    const { projid, sub } = parseSubscription(message._subscriber && message._subscriber._subscription);
    const span = cls.startSpan(
      'gcps',
      ENTRY,
      tracingUtil.readAttribCaseInsensitive(attribtes, traceIdHeaderNameLowerCase),
      tracingUtil.readAttribCaseInsensitive(attribtes, spanIdHeaderNameLowerCase)
    );
    span.ts = Date.now();
    span.stack = tracingUtil.getStackTrace(instrumentedEmitMessage);
    span.data.gcps = {
      op: 'consume',
      projid,
      sub,
      messageId: message.id
    };

    try {
      return originalEmit.apply(ctx, originalArgs);
    } finally {
      setImmediate(() => {
        // Client code is expected to end the span manually, end it automatically in case client code doesn't. Child
        // exit spans won't be captured, but at least the PubSub entry span is there.
        span.d = Date.now() - span.ts;
        span.transmit();
      });
    }
  });
}

function unqualifyName(name) {
  if (!name || typeof name !== 'string') {
    return;
  }
  const idxSlash = name.lastIndexOf('/');
  return name.substring(idxSlash + 1);
}

function parseSubscription(subscription) {
  if (!subscription || !subscription.name) {
    return {};
  }
  const matchResult = subscriptionRegex.exec(subscription.name);
  if (matchResult) {
    return { projid: matchResult[1], sub: matchResult[2] };
  }
  return {};
}

function finishSpan(err, messageId, span) {
  if (err) {
    addErrorToSpan(err, span);
  }
  if (typeof messageId === 'string') {
    span.data.gcps.messageId = messageId;
  }

  span.d = Date.now() - span.ts;
  span.transmit();
}

function addErrorToSpan(err, span) {
  if (err) {
    span.ec = 1;
    if (err.message) {
      span.data.gcps.error = err.message;
    } else if (typeof err === 'string') {
      span.data.gcps.error = err;
    }
  }
}

exports.activate = function activate() {
  isActive = true;
};

exports.deactivate = function deactivate() {
  isActive = false;
};
