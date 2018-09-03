/* eslint-disable no-console */

'use strict';

// Rethrowing the error (or, more generally, throwing any error) from the
// uncaughtException handler terminates the process with an exit code != 1.
// The orginal stack trace is preserved.

process.on('uncaughtException', function(err) {
  throw err;
});

function throwUncaughtError() {
  setTimeout(function() {
    throw new Error('Boom');
  }, 100);
}

throwUncaughtError();
