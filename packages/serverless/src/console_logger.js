/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

/* eslint-disable no-console */

'use strict';

// 30 = info
let minLevel = 30;

module.exports = exports = {
  debug: createLogFn(20, console.debug || console.log),
  info: createLogFn(30, console.log),
  warn: createLogFn(40, console.warn),
  error: createLogFn(50, console.error)
};

function createLogFn(level, fn) {
  return function log() {
    if (level >= minLevel) {
      fn.apply(console, arguments);
    }
  };
}

exports.setLevel = function setLevel(level) {
  // eslint-disable-next-line yoda
  if (typeof level === 'number' && 0 < level && level <= 50) {
    minLevel = level;
    return;
  }

  if (typeof level === 'string') {
    switch (level) {
      case 'debug':
        minLevel = 20;
        break;
      case 'info':
        minLevel = 30;
        break;
      case 'warn':
        minLevel = 40;
        break;
      case 'error':
        minLevel = 50;
        break;
      default:
        exports.warn(`Unknown log level: ${level}`);
    }
  }
};
