/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const shimmer = require('shimmer');

const requireHook = require('../../../util/requireHook');

let hasBeenPatched = false;

exports.init = () => {
  requireHook.onModuleLoad('cls-hooked', patchClsHooked);
};

// This module applies a patch to the cls-hooked module (https://github.com/Jeff-Lewis/cls-hooked/). This patch fixes a
// breakage that occurs in the following scenario:
// * The application under monitoring uses the cls-hooked package (in addition to @instana/core),
// * the application under monitoring binds the incoming http request object (`IncomingMessage`, which is an
//   event emitter), via cls-hooked#bindEmitter, and
// * the incoming request has a payload.

// The way cls-hooked and emitter-listener work would cause Instana's cls context to be lost in this scenario. In
// particular, cls-hooked will bind all event listener functions of the event emitter via cls-hooked#Namespace#bind,
// which replaces these functions with a wrapper function. But the cls context (also, the Instana cls context) is
// attached to the function object as a property. By replacing that function with a wrapper function, the cls context
// that had been attached to the function object is lost. To fix this, we instrument the cls-hooked package. (The reason
// why this only occurs when the request has a payload is that in that scenario work is triggered by the `onData` event
// listener of the request event emitter.)
//
// See also:
// * https://github.com/instana/nodejs/issues/438
// * https://github.com/jonathansamines/instana-context-loss
//
// Actually, this is a fix that should be incorporated into the cls-hooked package directly, but that package has
// apparently been abandoned by its maintainer. Note that on modern Node.js runtimes you might want to consider
// using [AsyncLocalStorage](https://nodejs.org/api/async_context.html#class-asynclocalstorage) instead of
// cls-hooked.

function patchClsHooked(clsHooked) {
  shimmer.wrap(clsHooked, 'getNamespace', shimGetOrCreateNamespace.bind(null, clsHooked));
  shimmer.wrap(clsHooked, 'createNamespace', shimGetOrCreateNamespace.bind(null, clsHooked));
}

function shimGetOrCreateNamespace(clsHooked, originalGetOrCreateNamespace) {
  return function () {
    if (hasBeenPatched) {
      return originalGetOrCreateNamespace.apply(this, arguments);
    }

    const potentialNamespace = originalGetOrCreateNamespace.apply(this, arguments);
    if (
      potentialNamespace &&
      potentialNamespace.constructor.name &&
      potentialNamespace.constructor.name === 'Namespace'
    ) {
      const namespacePrototype = Object.getPrototypeOf(potentialNamespace);
      shimmer.wrap(namespacePrototype, 'bind', shimBind);
      hasBeenPatched = true;
    }
    return potentialNamespace;
  };
}

function shimBind(originalBind) {
  return function () {
    // Namespace#bind returns a function which wraps the original function. To fix losing the Instana CLS context when
    // the application under monitoring uses [cls-hooked](https://github.com/Jeff-Lewis/cls-hooked/) on its own and
    // binds the IncomingMessage/HTTP request object event emitter, we need to copy over all properties from the
    // original function to the wrapper function.
    //
    const clsBind = originalBind.apply(this, arguments);
    const originalFunction = arguments[0];
    if (typeof originalFunction === 'function') {
      Object.keys(originalFunction).forEach(k => {
        clsBind[k] = originalFunction[k];
      });
    }
    return clsBind;
  };
}

exports.activate = () => {
  // nothing to do
};

exports.deactivate = () => {
  // nothing to do
};
