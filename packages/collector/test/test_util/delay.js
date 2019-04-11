/* global Promise */

'use strict';

/**
 * A simple delay based on native promises.
 */
module.exports = exports = function delay(ms) {
  return new Promise(function(resolve) {
    setTimeout(resolve, ms);
  });
};
