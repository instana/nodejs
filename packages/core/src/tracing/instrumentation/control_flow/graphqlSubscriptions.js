'use strict';

var shimmer = require('shimmer');

var requireHook = require('../../../util/requireHook');
var cls = require('../../cls');

var isActive = false;

exports.init = function() {
  requireHook.onModuleLoad('graphql-subscriptions', instrument);
};

function instrument(graphQlSubscriptions) {
  shimmer.wrap(graphQlSubscriptions.PubSub.prototype, 'publish', shimPublish);
}

function shimPublish(originalPublish) {
  return function(triggerName, payload) {
    if (isActive && cls.isTracing()) {
      // Keep cls context in GraphQL subscriptions by binding the associated event emitters.
      if (this.ee && this.ee.on && this.ee.addListener && this.ee.emit) {
        cls.ns.bindEmitter(this.ee);
      }

      var activeSpan = cls.getCurrentSpan();
      if (activeSpan && payload && typeof payload === 'object') {
        // Attach tracing context to payload to be able to retrieve it later in
        // src/tracing/instrumentation/protocols/graphql - even though the event emitter is bound,
        // cls context gets lost.
        payload.__in = {
          t: activeSpan.t,
          s: activeSpan.s
        };
      }
    }
    return originalPublish.apply(this, arguments);
  };
}

exports.activate = function() {
  isActive = true;
};

exports.deactivate = function() {
  isActive = false;
};
