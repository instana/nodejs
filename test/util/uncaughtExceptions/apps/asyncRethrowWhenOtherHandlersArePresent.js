/* eslint-disable no-console */

'use strict';

// This is already pretty close to how we handle uncaught exceptions in the instana-nodejs-sensor production code.

var eventName = 'uncaughtException';

process.on(eventName, function() {
  console.log('HANDLER 1');
});

process.on(eventName, function() {
  console.log('HANDLER 2');
});

process.once(eventName, function(err) {
  console.log('HANDLER 3');
  setTimeout(function() {
    console.log('Async operation has finished.');
    // rethrow the err after the async operation has finished to trigger the
    // process to finally terminate - Node won't run this handler again since it
    // has been registered with `once`.

    // Remove all listeners now, so the final throw err won't trigger other registered listeners a second time.
    var registeredListeners = process.listeners(eventName);
    if (registeredListeners) {
      registeredListeners.forEach(function(listener) {
        process.removeListener(eventName, listener);
      });
    }
    console.error('Caught an otherwise uncaught exception.');
    throw err;
  }, 500);
});

process.on(eventName, function() {
  console.log('HANDLER 4');
});

process.on(eventName, function() {
  console.log('HANDLER 5');
});

function throwUncaughtError() {
  setTimeout(function() {
    throw new Error('Boom');
  }, 100);
}

throwUncaughtError();
