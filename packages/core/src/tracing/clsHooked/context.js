/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

/* eslint-env es6 */
/* eslint-disable */

// This evolved from a copy of
// Jeff-Lewis, fix(destroy): destroy based on asyncId only (3cf7539  on Jul 25, 2017)
// https://github.com/Jeff-Lewis/cls-hooked/blob/066c6c4027a7924b06997cc6b175b1841342abdc/context.js

'use strict';

const util = require('util');
const assert = require('assert');
// @ts-ignore
const wrapEmitter = require('./emitter-listener');
const async_hooks = require('async_hooks');
const unset = require('./unset');

const CONTEXTS_SYMBOL = 'instanaClsHooked@contexts';

let currentUid = -1;

module.exports = {
  getNamespace,
  createNamespace,
  destroyNamespace,
  reset
};

/**
 * @typedef {Object.<string, *>} InstanaCLSContext
 */

/**
 * Creates a new CLS namespace.
 */
/**
 * @param {string} name
 */
function Namespace(name) {
  this.name = name;
  // changed in 2.7: no default context
  this.active = null;
  /** @type {Array.<InstanaCLSContext>} */
  this._set = [];
  this.id = null;
  this._contexts = new Map();
  this._indent = 0;
}

/**
 * Sets a key/value pair in the current CLS context. It can be retrieved later, but only from the same context
 * or a child context.
 * @param {string} key
 * @param {*} value
 * @returns
 */
Namespace.prototype.set = function set(key, value) {
  if (!this.active) {
    throw new Error('No context available. ns.run() or ns.bind() must be called first.');
  }

  const context = this.active;
  context[key] = value;

  return unset.bind(null, context, key, value);
};

/**
 * Retrieves a value by key from the current CLS context (or a parent context), assuming the key/value pair has
 * been set earlier in this context.
 * @param {string} key
 */
Namespace.prototype.get = function get(key) {
  if (!this.active) {
    return undefined;
  }
  return this.active[key];
};

/**
 * Creates a new CLS context in this namespace.
 */
Namespace.prototype.createContext = function createContext() {
  // Prototype inherit existing context if created a new child context within existing context.
  let context = Object.create(this.active ? this.active : Object.prototype);
  context._ns_name = this.name;
  context.id = currentUid;
  return context;
};

/**
 * Runs a function in a new CLS context. The context is left after the function terminates. Asynchronous work
 * started in this function will happen in that new context. The return value from that function (if any) is discarded.
 * If you aren't 100% certain that the function never returns a value or that client code never relies on that value,
 * use runAndReturn instead.
 * @param {Function} fn
 * @param {InstanaCLSContext} ctx
 */
Namespace.prototype.run = function run(fn, ctx) {
  let context = ctx || this.createContext();
  this.enter(context);

  try {
    fn(context);
    return context;
  } finally {
    this.exit(context);
  }
};

/**
 * Runs a function in a new CLS context and returns its return value. The context is left after the function
 * terminates. Asynchronous work started in this function will happen in that new context.
 * @param {Function} fn
 * @param {InstanaCLSContext} ctx
 */
Namespace.prototype.runAndReturn = function runAndReturn(fn, ctx) {
  let value;
  this.run((/** @type {InstanaCLSContext} */ context) => {
    value = fn(context);
  }, ctx);
  return value;
};

/**
 * Runs a function which returns a promise in a new CLS context and returns said promise. The context is left
 * as soon as the the promise resolves/is rejected. Asynchronous work started in this promise will happen in that new
 * context.
 *
 * If the given function does not create a then-able, an error will be thrown.
 *
 * This function assumes that the returned promise is CLS-friendly or wrapped already.
 * @param {Function} fn
 * @param {InstanaCLSContext} ctx
 */
Namespace.prototype.runPromise = function runPromise(fn, ctx) {
  let context = ctx || this.createContext();
  this.enter(context);

  let promise = fn(context);
  if (!promise || !promise.then || !promise.catch) {
    throw new Error('fn must return a promise.');
  }

  return promise
    .then((/** @type {*} */ result) => {
      this.exit(context);
      return result;
    })
    .catch((/** @type {*} */ err) => {
      this.exit(context);
      throw err;
    });
};

/**
 * Runs a function (which might or might not return a promise) in a new CLS context. If the given function indeed
 * returns a then-able, this behaves like runPromise. If not, this behaves like runAndReturn. In particular, no error is
 * thrown if the given function does not return a promise.
 *
 * This function assumes that the returned promise (if any) is CLS-friendly or wrapped already.
 * @param {Function} fn
 * @param {InstanaCLSContext} ctx
 */
Namespace.prototype.runPromiseOrRunAndReturn = function runPromiseOrRunAndReturn(fn, ctx) {
  let isPromise = false;
  let valueOrPromise;
  const context = ctx || this.createContext();
  this.enter(context);

  try {
    valueOrPromise = fn(context);
    isPromise = valueOrPromise && valueOrPromise.then && valueOrPromise.catch;
    if (isPromise) {
      // fn returned a promise, so we behave like this.runPromise.
      return valueOrPromise
        .then((/** @type {*} */ result) => {
          this.exit(context);
          return result;
        })
        .catch((/** @type {*} */ err) => {
          this.exit(context);
          throw err;
        });
    }
  } finally {
    if (!isPromise) {
      // fn did not return a promise, so we behave like this.runAndReturn.
      this.exit(context);
    }
  }

  return valueOrPromise;
};

/**
 * Returns a wrapper around the given function which will enter CLS context which is active at the time of calling bind
 * and leave that context once the function terminates. If no context is active, a new context will be created.
 * @param {Function} fn
 * @param {InstanaCLSContext} context
 */
Namespace.prototype.bind = function bind(fn, context) {
  if (!context) {
    if (!this.active) {
      context = this.createContext();
    } else {
      context = this.active;
    }
  }

  let self = this;
  return function clsBind() {
    self.enter(context);
    try {
      return fn.apply(this, arguments);
    } finally {
      self.exit(context);
    }
  };
};

/**
 * Binds the given emitter to the currently active CLS context. Work triggered by an emit from that emitter will happen
 * in that CLS context.
 * @param {import('events').EventEmitter} emitter
 */
Namespace.prototype.bindEmitter = function bindEmitter(emitter) {
  assert.ok(emitter.on && emitter.addListener && emitter.emit, 'can only bind real EEs');

  let namespace = this;
  let thisSymbol = `context@${this.name}`;

  /**
   * Capture the context active at the time the emitter is bound.
   * @param {*} listener
   */
  function attach(listener) {
    if (!listener) {
      return;
    }
    if (!listener[CONTEXTS_SYMBOL]) {
      listener[CONTEXTS_SYMBOL] = Object.create(null);
    }

    listener[CONTEXTS_SYMBOL][thisSymbol] = {
      namespace,
      context: namespace.active
    };
  }

  /**
   * At emit time, bind the listener within the correct context.
   * @param {*} unwrapped
   */
  function bind(unwrapped) {
    if (!(unwrapped && unwrapped[CONTEXTS_SYMBOL])) {
      return unwrapped;
    }

    let wrapped = unwrapped;
    let unwrappedContexts = unwrapped[CONTEXTS_SYMBOL];
    Object.keys(unwrappedContexts).forEach(name => {
      let thunk = unwrappedContexts[name];
      wrapped = thunk.namespace.bind(wrapped, thunk.context);
    });
    return wrapped;
  }

  wrapEmitter(emitter, attach, bind);
};

/**
 * @param {InstanaCLSContext} context
 */
Namespace.prototype.enter = function enter(context) {
  assert.ok(context, 'context must be provided for entering');
  this._set.push(this.active);
  this.active = context;
};

/**
 * @param {InstanaCLSContext} context
 */
Namespace.prototype.exit = function exit(context) {
  assert.ok(context, 'context must be provided for exiting');

  // Fast path for most exits that are at the top of the stack
  if (this.active === context) {
    assert.ok(this._set.length, "can't remove top context");
    this.active = this._set.pop();
    return;
  }

  // Fast search in the stack using lastIndexOf
  let index = this._set.lastIndexOf(context);

  if (index < 0) {
    assert.ok(
      index >= 0,
      `context not currently entered; can't exit. \n${util.inspect(this)}\n${util.inspect(context)}`
    );
  } else {
    assert.ok(index, "can't remove top context");
    this._set.splice(index, 1);
  }
};

/**
 * @param {string} name
 */
function getNamespace(name) {
  // @ts-ignore
  return process.instanaNamespaces[name];
}

/**
 * @param {string} name
 */
function createNamespace(name) {
  assert.ok(name, 'namespace must be given a name.');

  let namespace = new Namespace(name);
  namespace.id = currentUid;

  const hook = async_hooks.createHook({
    init(asyncId, _type, _triggerId, _resource) {
      currentUid = async_hooks.executionAsyncId();
      if (namespace.active) {
        namespace._contexts.set(asyncId, namespace.active);
      } else if (currentUid === 0) {
        // CurrentId will be 0 when triggered from C++. Promise events
        // https://github.com/nodejs/node/blob/master/doc/api/async_hooks.md#triggerid
        const triggerId = async_hooks.triggerAsyncId();
        const triggerIdContext = namespace._contexts.get(triggerId);
        if (triggerIdContext) {
          namespace._contexts.set(asyncId, triggerIdContext);
        }
      }
    },
    before(asyncId) {
      currentUid = async_hooks.executionAsyncId();
      let context;

      //HACK to work with promises until they are fixed in node > 8.1.1
      context = namespace._contexts.get(asyncId) || namespace._contexts.get(currentUid);

      if (context) {
        namespace.enter(context);
      }
    },
    after(asyncId) {
      currentUid = async_hooks.executionAsyncId();
      let context;

      //HACK to work with promises until they are fixed in node > 8.1.1
      context = namespace._contexts.get(asyncId) || namespace._contexts.get(currentUid);

      if (context) {
        namespace.exit(context);
      }
    },
    destroy(asyncId) {
      currentUid = async_hooks.executionAsyncId();
      namespace._contexts.delete(asyncId);
    }
  });

  hook.enable();

  // @ts-ignore
  process.instanaNamespaces[name] = namespace;
  return namespace;
}

/**
 * @param {string} name
 */
function destroyNamespace(name) {
  let namespace = getNamespace(name);

  assert.ok(namespace, `can't delete nonexistent namespace! "${name}"`);
  assert.ok(namespace.id, `don't assign to process.instanaNamespaces directly! ${util.inspect(namespace)}`);

  // @ts-ignore
  process.instanaNamespaces[name] = null;
}

function reset() {
  // must unregister async listeners
  // @ts-ignore
  if (process.instanaNamespaces) {
    // @ts-ignore
    Object.keys(process.instanaNamespaces).forEach(name => {
      destroyNamespace(name);
    });
  }
  // @ts-ignore
  process.instanaNamespaces = Object.create(null);
}
// @ts-ignore
process.instanaNamespaces = process.instanaNamespaces || {};
