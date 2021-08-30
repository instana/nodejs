/*
 * This is a vendored copy of https://github.com/othiym23/emitter-listener, including the modifications from
 * https://github.com/othiym23/emitter-listener/pull/7.
 *
 * Original license: BSD 2 Clause
 * (see https://github.com/othiym23/emitter-listener/blob/7586fba839cf87774d5df224ce479c3b7e2b9964/package.json#L26)
 *
 * A note on the usage of the properties __wrappedInstana, __unwrapInstana, __wrapped  and __unwrap: The original
 * package (https://github.com/othiym23/emitter-listener/blob/af156cef522f1daa11523b2d94b6f7fd1e859ca5/listener.js)
 * attaches properties named __wrapped and __unwrap to the event emitter object. Even with this fixed and vendored
 * version of emitter-listener, the issue fixed in https://github.com/othiym23/emitter-listener/pull/7 can still
 * persist if other packages install the unfixed emitter-listener package as a dependency, and if the unfixed version
 * of wrapEmitter gets called _after_ this version.
 *
 * To fix that, our version uses different property names (__wrappedInstana, __unwrapInstana) when attaching properties
 * to the event emitter object. In addition to that, both the original and this fixed version use the package shimmer
 * internally. The package shimmer also uses properties named __wrapped etc., but it attaches them to individual
 * functions instead of the event emitter object. emitter-listener relies on this and checks whether a function has been
 * shimmed by checking if the function has a __wrapped property. For those usages, we need to stick with the original
 * property names.
 */
// @ts-nocheck - not going to add type checking to a temporarily vendored dependency.

/* eslint-disable header/header */

'use strict';

const shimmer = require('shimmer');
const wrap = shimmer.wrap;
const unwrap = shimmer.unwrap;

const SYMBOL = 'instana@before';

// Sets a property on an object, preserving its enumerability.
// This function assumes that the property is already writable.
function defineProperty(obj, name, value) {
  // eslint-disable-next-line no-prototype-builtins
  const enumerable = !!obj[name] && obj.propertyIsEnumerable(name);
  Object.defineProperty(obj, name, {
    configurable: true,
    enumerable: enumerable,
    writable: true,
    value: value
  });
}

function _process(self, listeners) {
  const l = listeners.length;
  for (let p = 0; p < l; p++) {
    const listener = listeners[p];
    // set up the listener so that onEmit can do whatever it needs
    const before = self[SYMBOL];
    if (typeof before === 'function') {
      before(listener);
    } else if (Array.isArray(before)) {
      const length = before.length;
      for (let i = 0; i < length; i++) before[i](listener);
    }
  }
}

function _listeners(self, event) {
  let listeners = self._events && self._events[event];
  if (!Array.isArray(listeners)) {
    if (listeners) {
      listeners = [listeners];
    } else {
      listeners = [];
    }
  }

  return listeners;
}

function _findAndProcess(self, event, before) {
  const after = _listeners(self, event);
  const unprocessed = after.filter(function (fn) {
    return before.indexOf(fn) === -1;
  });
  if (unprocessed.length > 0) _process(self, unprocessed);
}

function _wrap(unwrapped, visit) {
  if (!unwrapped) return;

  let wrapped = unwrapped;
  if (typeof unwrapped === 'function') {
    wrapped = visit(unwrapped);
  } else if (Array.isArray(unwrapped)) {
    wrapped = [];
    for (let i = 0; i < unwrapped.length; i++) {
      wrapped[i] = visit(unwrapped[i]);
    }
  }
  return wrapped;
}

module.exports = function wrapEmitter(emitter, onAddListener, onEmit) {
  if (!emitter || !emitter.on || !emitter.addListener || !emitter.removeListener || !emitter.emit) {
    throw new Error('can only wrap real EEs');
  }

  if (!onAddListener) throw new Error('must have function to run on listener addition');
  if (!onEmit) throw new Error('must have function to wrap listeners when emitting');

  /* Attach a context to a listener, and make sure that this hook stays
   * attached to the emitter forevermore.
   */
  function adding(on) {
    return function added(event, listener) {
      const existing = _listeners(this, event).slice();

      try {
        const returned = on.call(this, event, listener);
        _findAndProcess(this, event, existing);
        return returned;
      } finally {
        // old-style streaming overwrites .on and .addListener, so rewrap
        if (!this.on.__wrapped) wrap(this, 'on', adding);
        if (!this.addListener.__wrapped) wrap(this, 'addListener', adding);
      }
    };
  }

  function emitting(emit) {
    return function emitted(event) {
      if (!this._events || !this._events[event]) return emit.apply(this, arguments);

      let unwrapped = this._events[event];

      /* Ensure that if removeListener gets called, it's working with the
       * unwrapped listeners.
       */
      function remover(removeListener) {
        return function removed() {
          this._events[event] = unwrapped;
          try {
            return removeListener.apply(this, arguments);
          } finally {
            unwrapped = this._events[event];
            this._events[event] = _wrap(unwrapped, onEmit);
          }
        };
      }
      wrap(this, 'removeListener', remover);

      try {
        /* At emit time, ensure that whatever else is going on, removeListener will
         * still work while at the same time running whatever hooks are necessary to
         * make sure the listener is run in the correct context.
         */
        this._events[event] = _wrap(unwrapped, onEmit);
        return emit.apply(this, arguments);
      } finally {
        /* Ensure that regardless of what happens when preparing and running the
         * listeners, the status quo ante is restored before continuing.
         */
        unwrap(this, 'removeListener');
        this._events[event] = unwrapped;
      }
    };
  }

  // support multiple onAddListeners
  if (!emitter[SYMBOL]) {
    defineProperty(emitter, SYMBOL, onAddListener);
  } else if (typeof emitter[SYMBOL] === 'function') {
    defineProperty(emitter, SYMBOL, [emitter[SYMBOL], onAddListener]);
  } else if (Array.isArray(emitter[SYMBOL])) {
    emitter[SYMBOL].push(onAddListener);
  }

  // Only wrap `on` and `addListener` once. Correctly registering all
  // `onAddListener` callbacks for multiple consecutive wrapEmitter calls for
  // the same emitter is handled above by pushing them into an array if necessary.
  if (!emitter.__wrappedInstana) {
    wrap(emitter, 'addListener', adding);
    wrap(emitter, 'on', adding);

    defineProperty(emitter, '__unwrapInstana', function () {
      unwrap(emitter, 'addListener');
      unwrap(emitter, 'on');
      unwrap(emitter, 'emit');
      delete emitter[SYMBOL];
      delete emitter.__wrappedInstana;
    });
    defineProperty(emitter, '__wrappedInstana', true);
  }

  // Always wrap `emit`, no matter if the emitter has already been wrapped by
  // an earlier wrapEmitter call or not. We need to make sure that all onEmit
  // callbacks are registered. The `onEmit` handler from later wrapEmitter calls
  // will wrap handlers from earlier calls. That is, they will be called in the
  // reverse order of how they have been registered.
  wrap(emitter, 'emit', emitting);
};
