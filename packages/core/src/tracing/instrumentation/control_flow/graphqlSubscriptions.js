/* global Symbol */

'use strict';

var shimmer = require('shimmer');

var requireHook = require('../../../util/requireHook');
var cls = require('../../cls');

var isActive = false;

var CLS_CONTEXT_SYMBOL = Symbol('_instana_cls_context');

exports.init = function() {
  requireHook.onModuleLoad('graphql-subscriptions', instrumentModule);
  requireHook.onFileLoad(/\/graphql-subscriptions\/dist\/pubsub-async-iterator\.js/, instrumentAsyncIterator);
};

function instrumentModule(graphQlSubscriptions) {
  shimmer.wrap(graphQlSubscriptions.PubSub.prototype, 'publish', shimPublish);
}

function shimPublish(originalPublish) {
  return function() {
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
  return function(event) {
    if (isActive && event && typeof event === 'object' && cls.ns.active) {
      event[CLS_CONTEXT_SYMBOL] = cls.ns.active;
    }
    return originalFunction.apply(this, arguments);
  };
}

function shimPullValue(originalFunction) {
  return function() {
    var pullPromise = originalFunction.apply(this, arguments);
    return pullPromise.then(function(result) {
      if (result && result.value && result.value[CLS_CONTEXT_SYMBOL]) {
        var clsContext = result.value[CLS_CONTEXT_SYMBOL];
        if (isActive && clsContext) {
          cls.ns.enter(clsContext);
          setImmediate(function() {
            cls.ns.exit(clsContext);
          });
        }
      }
      return result;
    });
  };
}

exports.activate = function() {
  isActive = true;
};

exports.deactivate = function() {
  isActive = false;
};
