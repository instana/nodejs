/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. 2018
 */

/* eslint-disable no-console */

'use strict';

// Rethrowing the error (or, more generally, throwing any error) from the
// uncaughtException handler terminates the process with an exit code != 1.
// The orginal stack trace is preserved.

process.on('uncaughtException', err => {
  throw err;
});

function throwUncaughtError() {
  setTimeout(() => {
    throw new Error('Boom');
  }, 100);
}

throwUncaughtError();
