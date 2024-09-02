/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

/**
 * This is a reimplementation of the cls-hooked API on top of AsyncLocalStorage.
 * This implementation is used instead of the cls-hooked based implementation in Node.js runtimes where
 * AsyncLocalStorage is available. It exposes the same API as the previous implementation, and can be used
 * interchangeably.
 */

'use strict';

const util = require('util');
const assert = require('assert');
const wrapEmitter = require('./emitter-listener');
const { AsyncLocalStorage, executionAsyncId } = require('async_hooks');
const unset = require('./unset');

const CONTEXTS_SYMBOL = 'instanaClsHooked@contexts';

const storage = new AsyncLocalStorage();

module.exports = {
  createNamespace,
  reset,
  destroyNamespace,
  getNamespace
};

/**
 * @typedef {Object.<string, *>} InstanaCLSContext
 */

/**
 * Creates a new CLS namespace.
 */
class Namespace {
  /**
   * @param {string} name
   */
  constructor(name) {
    /*
     * The idea behind `sharedContext` is to keep a reference to an already finished context, that we might need to use
     * as the parent context for the next instrumentation. This workaround is only used in exactly one edge case:
     * GraphQL client spans for GraphQL subscription updates. In the instrumentation for GraphQL subscription update, we
     * use it to find the parent entry span (usually an HTTP entry). In this case, the context for the parent entry span
     * is properly managed by the AsyncLocalStorage and the context is exited correctly when the request is terminated.
     * Due to some custom queuing mechanism in the graphql-subscriptions module, the subscription update happens outside
     * of the correct context.
     *
     * This workaround is a best effort and can potentially lead to falling back to the wrong parent context in some
     * cases. We work with the assumption that the stored `sharedContext` is the correct context when the next
     * instrumentation, which relies on it, needs to find its parent context. But other requests might hav interupted
     * and overwritten the `sharedContext` at that time.
     *
     * This problem already exists in a similar form in the cls-hooked based implementation in ../context.js.
     *
     * See also https://github.com/instana/nodejs/commit/1c399d99b8909e0d4b197ab092e2af3f93776cd6.
     */
    this.sharedContext = null;
    this.name = name;
    this.active = null;
    this.id = -1;
    this._indent = 0;

    Object.defineProperty(this, 'active', {
      get() {
        return storage.getStore();
      }
    });
  }

  /**
   * Sets a key/value pair in the current CLS context. It can be retrieved later, but only from the same context
   * or a child context.
   * @param {string} key
   * @param {*} value
   * @returns {Function}
   */
  set(key, value) {
    const context = storage.getStore();
    if (!context) {
      throw new Error('No context available. ns.run() or ns.bind() must be called first.');
    }

    context[key] = value;
    return unset.bind(null, context, key, value);
  }

  /**
   * Retrieves a value by key from the current CLS context (or a parent context), assuming the key/value pair has
   * been set earlier in this context.
   *
   * When `fallbackToSharedContext` is set to true, the caller tries to access a parent context,
   * which got remembered in a previous instrumentation.
   *
   * @param {string} key
   * @param {boolean} [fallbackToSharedContext=false]
   */
  get(key, fallbackToSharedContext = false) {
    const activeContext = storage.getStore() || (fallbackToSharedContext ? this.sharedContext : undefined);
    if (!activeContext) {
      return undefined;
    }

    return activeContext[key];
  }

  /**
   * Creates a new CLS context in this namespace as a child of the currently active context (or as a root context if no
   * context is currently active).
   * @returns {InstanaCLSContext}
   */
  createContext() {
    const activeContext = storage.getStore();
    // Prototype inherit existing context if created a new child context within existing context.
    const context = Object.create(activeContext || Object.prototype);
    context._ns_name = this.name;
    context.id = executionAsyncId();
    return context;
  }

  /**
   * Creates a new root CLS context in this namespace, independent of the currently active context.
   *
   * @returns {InstanaCLSContext}
   */
  createRootContext() {
    const context = Object.create(Object.prototype);
    context._ns_name = this.name;
    context.id = executionAsyncId();
    return context;
  }

  /**
   * Runs a function in a new CLS context. The context is left after the function terminates. Asynchronous work started
   * in this function will happen in that new context. The return value from that function (if any) is discarded.
   * If you aren't 100% certain that the function never returns a value or that client code never relies on that value,
   * use runAndReturn instead.
   * @param {Function} fn
   * @param {InstanaCLSContext} ctx
   */
  run(fn, ctx) {
    const context = ctx || this.createContext();

    storage.run(context, () => fn(context));
    return context;
  }

  /**
   * Runs a function in a new CLS context and returns its return value. The context is left after the function
   * terminates. Asynchronous work started in this function will happen in that new context.
   * @param {Function} fn
   * @param {InstanaCLSContext} ctx
   */
  runAndReturn(fn, ctx) {
    let value;
    this.run((/** @type {InstanaCLSContext} */ context) => {
      value = fn(context);
    }, ctx);
    return value;
  }

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
  runPromise(fn, ctx) {
    const context = ctx || this.createContext();

    /**
     * We need the new context to be set as the active context before the promise is called.
     * Otherwise, the current active context will cause the new span transmission to fail.
     * Unlike our old code, AsyncLocalStorage.run does not update the active context, so we have to do it manually with
     * storage.enterWith. This is done by `this.enter`, which calls `enterWith`.
     * The same happens in the old code, and for the same reasons.
     */
    this.enter(context);

    const promise = fn(context);
    if (!promise || !promise.then || !promise.catch) {
      throw new Error('fn must return a promise.');
    }

    return promise;
  }

  /**
   * Runs a function (which might or might not return a promise) in a new CLS context. If the given function indeed
   * returns a then-able, this behaves like runPromise. If not, this behaves like runAndReturn. In particular, no error
   * is thrown if the given function does not return a promise.
   *
   * This function assumes that the returned promise (if any) is CLS-friendly or wrapped already.
   * @param {Function} fn
   * @param {InstanaCLSContext} ctx
   */
  runPromiseOrRunAndReturn(fn, ctx) {
    let isPromise = false;
    const context = ctx || this.createContext();
    this.enter(context);

    const valueOrPromise = fn(context);
    isPromise = valueOrPromise && valueOrPromise.then && valueOrPromise.catch;
    if (isPromise) {
      return valueOrPromise;
    }
  }

  /**
   * Returns a wrapper around the given function which will enter CLS context which is active at the time of calling
   * bind and leave that context once the function terminates. If no context is active, a new context will be created.
   * @param {Function} fn
   * @param {InstanaCLSContext} context
   */
  bind(fn, context) {
    context = context || storage.getStore() || this.createContext();

    const self = this;

    // console.log(arguments, context, 'AAAAAAAAAAAAAAaaaaaa');

    return function clsBind() {
      self.enter(context);
      return fn.apply(this, arguments);
    };
  }

  /**
   * Binds the given emitter to the currently active CLS context. Work triggered by an emit from that emitter will
   * happen in that CLS context.
   * @param {import('events').EventEmitter} emitter
   */
  bindEmitter(emitter) {
    assert.ok(emitter.on && emitter.addListener && emitter.emit, 'can only bind real EEs');

    const namespace = this;
    const thisSymbol = `context@${this.name}`;

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
        context: storage.getStore()
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
      const unwrappedContexts = unwrapped[CONTEXTS_SYMBOL];
      Object.keys(unwrappedContexts).forEach(name => {
        const thunk = unwrappedContexts[name];
        wrapped = thunk.namespace.bind(wrapped, thunk.context);
      });
      return wrapped;
    }

    wrapEmitter(emitter, attach, bind);
  }

  /**
   * @param {InstanaCLSContext} context
   */
  enter(context) {
    assert.ok(context, 'context must be provided for entering');
    storage.enterWith(context);
    this.sharedContext = context;
  }

  /**
   * @param {InstanaCLSContext} context
   */
  exit(context) {
    assert.ok(context, 'context must be provided for exiting');
  }
}

/**
 * @param {string} name
 */
function getNamespace(name) {
  // @ts-ignore: Property 'instanaNamespaces' does not exist on type 'Process'
  return process.instanaNamespaces[name];
}

/**
 * @param {string} name
 */
function createNamespace(name) {
  assert.ok(name, 'namespace must be given a name.');

  const namespace = new Namespace(name);
  namespace.id = executionAsyncId();

  // @ts-ignore: Property 'instanaNamespaces' does not exist on type 'Process'
  process.instanaNamespaces[name] = namespace;
  return namespace;
}

/**
 * @param {string} name
 */
function destroyNamespace(name) {
  const namespace = getNamespace(name);

  assert.ok(namespace, `can't delete nonexistent namespace! "${name}"`);
  assert.ok(namespace.id, `don't assign to process.instanaNamespaces directly! ${util.inspect(namespace)}`);

  // @ts-ignore: Property 'instanaNamespaces' does not exist on type 'Process'
  process.instanaNamespaces[name] = null;
}

function reset() {
  // must unregister async listeners
  // @ts-ignore: Property 'instanaNamespaces' does not exist on type 'Process'
  if (process.instanaNamespaces) {
    // @ts-ignore
    Object.keys(process.instanaNamespaces).forEach(name => {
      destroyNamespace(name);
    });
  }
  // @ts-ignore: Property 'instanaNamespaces' does not exist on type 'Process'
  process.instanaNamespaces = Object.create(null);
}

// @ts-ignore: Property 'instanaNamespaces' does not exist on type 'Process'
process.instanaNamespaces = process.instanaNamespaces || {};
