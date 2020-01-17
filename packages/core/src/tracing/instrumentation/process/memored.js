'use strict';

var requireHook = require('../../../util/requireHook');
var cls = require('../../cls');

var isActive = false;

exports.init = function() {
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

  var original = memored[fnName];
  memored[fnName] = function() {
    if (!isActive) {
      return original.apply(this, arguments);
    }

    // copy the arguments
    var originalArgs = new Array(arguments.length);
    for (var i = 0; i < arguments.length; i++) {
      originalArgs[i] = arguments[i];
    }
    // find the callback (if one has been provided)
    var originalCb;
    for (i = originalArgs.length - 1; i >= 0; i--) {
      if (typeof originalArgs[i] === 'function') {
        // bind callback so the CLS context is kept
        originalCb = originalArgs[i];
        break;
      }
    }
    if (originalCb) {
      originalArgs[i] = cls.ns.bind(function() {
        originalCb.apply(this, arguments);
      });
    }

    return original.apply(this, originalArgs);
  };
}

exports.activate = function() {
  isActive = true;
};

exports.deactivate = function() {
  isActive = false;
};
