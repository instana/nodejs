'use strict';

/**
 * A simple delay based on native promises.
 */
module.exports = exports = function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
};
