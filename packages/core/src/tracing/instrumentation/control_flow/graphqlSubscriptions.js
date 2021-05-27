/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const shimmer = require('shimmer');

const requireHook = require('../../../util/requireHook');
const cls = require('../../cls');

let isActive = false;

const CLS_CONTEXT_SYMBOL = Symbol('_instana_cls_context');

exports.init = () => {
  requireHook.onModuleLoad('graphql-subscriptions', instrumentModule);
  requireHook.onFileLoad(/\/graphql-subscriptions\/dist\/pubsub-async-iterator\.js/, instrumentAsyncIterator);
};

function instrumentModule(graphQlSubscriptions) {
  shimmer.wrap(graphQlSubscriptions.PubSub.prototype, 'publish', shimPublish);
}

function shimPublish(originalPublish) {
  return function () {
    if (isActive && cls.isTracing()) {
      // Keep cls context in GraphQL subscriptions by binding the associated event emitters.
      if (this.ee && this.ee.on && this.ee.addListener && this.ee.emit) {
        cls.ns.bindEmitter(this.ee);
      }
    }
    return originalPublish.apply(this, arguments);
  };
}

function instrumentAsyncIterator(pubSubAsyncIterator) {
  shimmer.wrap(pubSubAsyncIterator.PubSubAsyncIterator.prototype, 'pushValue', shimPushValue);
  shimmer.wrap(pubSubAsyncIterator.PubSubAsyncIterator.prototype, 'pullValue', shimPullValue);
}

function shimPushValue(originalFunction) {
  return function (event) {
    if (isActive && event && typeof event === 'object' && cls.ns.active) {
      event[CLS_CONTEXT_SYMBOL] = cls.ns.active;
    }
    return originalFunction.apply(this, arguments);
  };
}

function shimPullValue(originalFunction) {
  return function () {
    const pullPromise = originalFunction.apply(this, arguments);
    return pullPromise.then(result => {
      if (result && result.value && result.value[CLS_CONTEXT_SYMBOL]) {
        const clsContext = result.value[CLS_CONTEXT_SYMBOL];
        if (isActive && clsContext) {
          cls.ns.enter(clsContext);
          setImmediate(() => {
            cls.ns.exit(clsContext);
          });
        }
      }
      return result;
    });
  };
}

exports.activate = () => {
  isActive = true;
};

exports.deactivate = () => {
  isActive = false;
};
