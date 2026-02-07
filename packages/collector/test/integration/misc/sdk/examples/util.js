/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const defaultDelayBetweenCalls = 10;

exports.delayBetweenCalls = defaultDelayBetweenCalls;
if (process.env.DELAY) {
  exports.delayBetweenCalls = parseInt(process.env.DELAY, 10);
  if (Number.isNaN(exports.delayBetweenCalls)) {
    exports.delayBetweenCalls = defaultDelayBetweenCalls;
  }
}

// eslint-disable-next-line no-console
console.log(`delay between calls: ${exports.delayBetweenCalls}`);

exports.simulateWork = function simulateWork(ms = 2) {
  return new Promise(resolve => setTimeout(resolve, ms));
};

exports.simulateWorkCallback = function simulateWork(cb, ms = 2) {
  setTimeout(cb, ms);
};
