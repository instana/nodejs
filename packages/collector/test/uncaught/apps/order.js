/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. 2018
 */

/* eslint-disable no-console */

'use strict';

// Handlers are called in the same order they are registered.
// See https://nodejs.org/api/events.html#events_emitter_emit_eventname_args

process.on('uncaughtException', () => {
  console.log('HANDLER 1');
});

process.on('uncaughtException', () => {
  console.log('HANDLER 2');
});

function throwUncaughtError() {
  setTimeout(() => {
    throw new Error('Boom');
  }, 100);
}

throwUncaughtError();

setTimeout(() => {
  console.log('Bye, bye');
}, 200);
