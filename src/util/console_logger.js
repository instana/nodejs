/* eslint-disable no-console */

'use strict';

let minLevel = 40;

module.exports = exports = {
  debug: createLogFn(20, console.debug),
  info: createLogFn(30, console.log),
  warn: createLogFn(40, console.warn),
  error: createLogFn(50, console.error)
};

function createLogFn(level, fn) {
  return function() {
    if (level >= minLevel) {
      fn.apply(console, arguments);
    }
  };
}

exports.setLevel = function(level) {
  if (typeof level === 'number' && 0 < level && level <= 50) {
    minLevel = level;
    return;
  } else if (typeof level === 'string') {
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
    }
  }
};
