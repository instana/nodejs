/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2015
 */

/* eslint-disable consistent-return */

'use strict';

/** @type {import('../logger').GenericLogger} */
let logger;

logger = require('../logger').getLogger('util/atMostOnce', newLogger => {
  logger = newLogger;
});

/**
 * Make sure that a function is only ever called once. This is useful to maintain
 * the contract that a callback should only ever be called once.
 *
 * Any violations against this contract will be logged for further analysis.
 *
 * @param {String} name The name of the callback to make debugging easier.
 * @param {(...args: *) => *} cb The callback to execute at most once.
 * @return {(...args: *) => *} A wrapped function which will forward the first call to `cb`
 *   and log any successive calls.
 */
module.exports = function atMostOnce(name, cb) {
  let callCount = 0;
  return function callbackWrappedForAtMostOneExecution() {
    callCount++;
    if (callCount === 1) {
      return cb.apply(null, arguments);
    }

    logger.debug('Function %s was called %s times. This time with the following arguments.', name, callCount, {
      args: Array.prototype.slice.call(arguments)
    });
  };
};
