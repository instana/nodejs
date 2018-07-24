/* eslint-disable no-console */

'use strict';

process.once('uncaughtException', function(err) {
  setTimeout(function() {
    console.log('Async operation has finished.');
    // rethrow the err after the async operation has finished to trigger a
    // finally terminate - Node won't run this handler again since it has been
    // registered with `once`.
    throw err;
  }, 500);
});

function throwUncaughtError() {
  setTimeout(function() {
    throw new Error('Boom');
  }, 100);
}

throwUncaughtError();
