/* eslint-disable no-console */

'use strict';

// Handlers are called in the same order they are registered.
// See https://nodejs.org/api/events.html#events_emitter_emit_eventname_args

process.on('uncaughtException', function() {
  console.log('HANDLER 1');
});

process.on('uncaughtException', function() {
  console.log('HANDLER 2');
});

function throwUncaughtError() {
  setTimeout(function() {
    throw new Error('Boom');
  }, 100);
}

throwUncaughtError();

setTimeout(function() {
  console.log('Bye, bye');
}, 200);
