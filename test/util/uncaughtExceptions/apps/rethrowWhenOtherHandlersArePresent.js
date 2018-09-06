/* eslint-disable no-console */

'use strict';

// When a handler throws an error (for example rethrowing the original
// error), handlers that have been registered after the throwing handler will
// not be called. All handlers that were registered earlier will be run.

process.on('uncaughtException', function() {
  console.log('HANDLER 1');
});

process.on('uncaughtException', function() {
  console.log('HANDLER 2');
});

process.on('uncaughtException', function(err) {
  console.log('HANDLER 3');
  throw err;
});

process.on('uncaughtException', function() {
  console.log('HANDLER 4');
});

process.on('uncaughtException', function() {
  console.log('HANDLER 5');
});

function throwUncaughtError() {
  setTimeout(function() {
    throw new Error('Boom');
  }, 100);
}

throwUncaughtError();
