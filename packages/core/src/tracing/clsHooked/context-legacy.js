/* eslint-env es6 */
/* eslint-disable */

// This evolved from a copy of
// Jeff-Lewis, feat(compat): v4.2 for node v4.7-v8 (0ebfb9b  on Jul 21, 2017)
// https://github.com/Jeff-Lewis/cls-hooked/blob/066c6c4027a7924b06997cc6b175b1841342abdc/context-legacy.js

'use strict';

const util = require('util');
const assert = require('assert');
const wrapEmitter = require('emitter-listener');
const asyncHook = require('async-hook-jl');
const unset = require('./unset');

const CONTEXTS_SYMBOL = 'instanaClsHooked@contexts';

const invertedProviders = [];
for (let key in asyncHook.providers) {
  invertedProviders[asyncHook.providers[key]] = key;
}

let currentUid = -1;

module.exports = {
  getNamespace: getNamespace,
  createNamespace: createNamespace,
  destroyNamespace: destroyNamespace,
  reset: reset
};

function Namespace(name) {
  this.name = name;
  // changed in 2.7: no default context
  this.active = null;
  this._set = [];
  this.id = null;
  this._contexts = new Map();
}

Namespace.prototype.set = function set(key, value) {
  if (!this.active) {
    throw new Error('No context available. ns.run() or ns.bind() must be called first.');
  }

  var context = this.active;
  context[key] = value;
  return unset.bind(null, context, key, value);
};

Namespace.prototype.get = function get(key) {
  if (!this.active) {
    return undefined;
  }
  return this.active[key];
};

Namespace.prototype.createContext = function createContext() {
  let context = Object.create(this.active ? this.active : Object.prototype);
  context._ns_name = this.name;
  context.id = currentUid;

  return context;
};

Namespace.prototype.run = function run(fn) {
  let context = this.createContext();
  this.enter(context);
  try {
    fn(context);
    return context;
  } finally {
    this.exit(context);
  }
};

Namespace.prototype.runAndReturn = function runAndReturn(fn) {
  var value;
  this.run(function(context) {
    value = fn(context);
  });
  return value;
};

/**
 * Uses global Promise and assumes Promise is cls friendly or wrapped already.
 * @param {function} fn
 * @returns {*}
 */
Namespace.prototype.runPromise = function runPromise(fn) {
  let context = this.createContext();
  this.enter(context);

  let promise = fn(context);
  if (!promise || !promise.then || !promise.catch) {
    throw new Error('fn must return a promise.');
  }

  return promise
    .then(result => {
      this.exit(context);
      return result;
    })
    .catch(err => {
      this.exit(context);
      throw err;
    });
};

Namespace.prototype.runPromiseOrRunAndReturn = function runPromiseOrRunAndReturn(fn) {
  throw new Error('Namespace.prototype.runPromiseOrRunAndReturn is not supported in Node.js < 8.');
};

Namespace.prototype.bind = function bindFactory(fn, context) {
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

Namespace.prototype.enter = function enter(context) {
  assert.ok(context, 'context must be provided for entering');
  this._set.push(this.active);
  this.active = context;
};

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
      "context not currently entered; can't exit. \n" + util.inspect(this) + '\n' + util.inspect(context)
    );
  } else {
    assert.ok(index, "can't remove top context");
    this._set.splice(index, 1);
  }
};

Namespace.prototype.bindEmitter = function bindEmitter(emitter) {
  assert.ok(emitter.on && emitter.addListener && emitter.emit, 'can only bind real EEs');

  let namespace = this;
  let thisSymbol = 'context@' + this.name;

  // Capture the context active at the time the emitter is bound.
  function attach(listener) {
    if (!listener) {
      return;
    }
    if (!listener[CONTEXTS_SYMBOL]) {
      listener[CONTEXTS_SYMBOL] = Object.create(null);
    }

    listener[CONTEXTS_SYMBOL][thisSymbol] = {
      namespace: namespace,
      context: namespace.active
    };
  }

  // At emit time, bind the listener within the correct context.
  function bind(unwrapped) {
    if (!(unwrapped && unwrapped[CONTEXTS_SYMBOL])) {
      return unwrapped;
    }

    let wrapped = unwrapped;
    let unwrappedContexts = unwrapped[CONTEXTS_SYMBOL];
    Object.keys(unwrappedContexts).forEach(function(name) {
      let thunk = unwrappedContexts[name];
      wrapped = thunk.namespace.bind(wrapped, thunk.context);
    });
    return wrapped;
  }

  wrapEmitter(emitter, attach, bind);
};

function getNamespace(name) {
  return process.namespaces[name];
}

function createNamespace(name) {
  assert.ok(name, 'namespace must be given a name.');

  let namespace = new Namespace(name);
  namespace.id = currentUid;

  asyncHook.addHooks({
    init(uid, handle, provider, parentUid, parentHandle) {
      //parentUid = parentUid || currentUid;  // Suggested usage but appears to work better for tracing modules.
      currentUid = uid;

      //CHAIN Parent's Context onto child if none exists. This is needed to pass net-events.spec
      if (parentUid) {
        namespace._contexts.set(uid, namespace._contexts.get(parentUid));
      } else {
        namespace._contexts.set(currentUid, namespace.active);
      }
    },
    pre(uid, handle) {
      currentUid = uid;
      let context = namespace._contexts.get(uid);
      if (context) {
        namespace.enter(context);
      }
    },
    post(uid, handle) {
      currentUid = uid;
      let context = namespace._contexts.get(uid);
      if (context) {
        namespace.exit(context);
      }
    },
    destroy(uid) {
      currentUid = uid;
      namespace._contexts.delete(uid);
    }
  });

  process.namespaces[name] = namespace;
  return namespace;
}

function destroyNamespace(name) {
  let namespace = getNamespace(name);

  assert.ok(namespace, 'can\'t delete nonexistent namespace! "' + name + '"');
  assert.ok(namespace.id, "don't assign to process.namespaces directly! " + util.inspect(namespace));

  process.namespaces[name] = null;
}

function reset() {
  // must unregister async listeners
  if (process.namespaces) {
    Object.keys(process.namespaces).forEach(function(name) {
      destroyNamespace(name);
    });
  }
  process.namespaces = Object.create(null);
}

process.namespaces = {};

if (asyncHook._state && !asyncHook._state.enabled) {
  asyncHook.enable();
}
