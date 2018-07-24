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
    // eslint-disable-next-line max-len
    console.error('The Instana Node.js sensor caught an otherwise uncaught exception to generate a respective event in Instana for you. This means that you have configured Instana to do just that (this feature is opt-in). Instana will now rethrow the error to terminate the process, otherwise the application might be in an inconsistent state, see https://nodejs.org/api/process.html#process_warning_using_uncaughtexception_correctly. The next line on stderr will look as if Instana crashed your application, but actually the original error came from your application code, not from Instana. Since we rethrow the original error, you should see its stacktrace below (depening on how you operate your application and how logging is configured.)');
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
