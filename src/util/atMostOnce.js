/* eslint-disable consistent-return */

'use strict';

var logger = require('../logger').getLogger('atMostOnce');

/**
 * Make sure that a function is only ever called once. This is useful to maintain
 * the contract that a callback should only ever be called once.
 *
 * Any violations against this contract will be logged for further analysis.
 *
 * @param {String} name The name of the callback to make debugging easier.
 * @param {Function} cb The callback to execute at most once.
 * @return {Function} A wrapped function which will forward the first call to `cb`
 *   and log any successive calls.
 */
module.exports = function atMostOnce(name, cb) {
  var callCount = 0;
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
