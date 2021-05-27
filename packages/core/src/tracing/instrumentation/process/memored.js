/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const requireHook = require('../../../util/requireHook');
const cls = require('../../cls');

let isActive = false;

exports.init = function init() {
  requireHook.onFileLoad(/\/memored\/index.js/, instrumentMemored);
};

// This instruments a dependency of edgemicro that usually lives in
// /path/to/edgemicro/node_modules/microgateway-plugins/third_party/memored/.
// The package microgateway-plugins is a normal npm dependency of edgemicro, but a copy of memored is included directly
// in the microgateway-plugins. The way memored sends process messages back and forth between the cluster master and
// cluster workers breaks async_hooks. More specifically:
// - In the cluster worker process, memored uses _sendMessageToMaster internally, which uses Node.js' built-in IPC
//   mechanism process.send.
// - memored then stores the message it has sent together with the user provided callback in a map and waits for the
//   response from the cluster master process (process.on('message', ...).
// - Once that response has arrived in the cluster worker, memored retrieves the original message and the attached
//   callback from its map and calls that callback.
// - Thus, the call to that callback does not happen in the asynchronous context that was active when the memored
//   function had been called, but in a new context opened by process.on('message', ...).
//
// This instrumentation makes sure the original context is restored when executing the callback via cls.ns.bind.
function instrumentMemored(memored) {
  ['read', 'multiRead', 'store', 'multiStore', 'remove', 'multiRemove', 'clean', 'size', 'keys'].forEach(
    instrumentMemoredFunction.bind(null, memored)
  );
  return memored;
}

function instrumentMemoredFunction(memored, fnName) {
  if (typeof memored[fnName] !== 'function') {
    // silently ignore non-existing functions
    return;
  }

  const original = memored[fnName];
  memored[fnName] = function () {
    if (!isActive) {
      return original.apply(this, arguments);
    }

    // copy the arguments
    const originalArgs = new Array(arguments.length);
    for (let i = 0; i < arguments.length; i++) {
      originalArgs[i] = arguments[i];
    }
    // find the callback (if one has been provided)
    let originalCb;
    let j;
    for (j = originalArgs.length - 1; j >= 0; j--) {
      if (typeof originalArgs[j] === 'function') {
        // bind callback so the CLS context is kept
        originalCb = originalArgs[j];
        break;
      }
    }
    if (originalCb) {
      originalArgs[j] = cls.ns.bind(function () {
        originalCb.apply(this, arguments);
      });
    }

    return original.apply(this, originalArgs);
  };
}

exports.activate = function activate() {
  isActive = true;
};

exports.deactivate = function deactivate() {
  isActive = false;
};
