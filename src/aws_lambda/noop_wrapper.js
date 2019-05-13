'use strict';

exports.wrap = exports.wrapWithCallback = exports.wrapPromise = exports.wrapAsync = noopWrap;

function noopWrap(config, originalHandler) {
  if (arguments.length === 1) {
    originalHandler = config;
  }
  return originalHandler;
}
