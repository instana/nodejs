'use strict';

exports.wrap = exports.wrapWithCallback = exports.wrapPromise = exports.wrapAsync = noopWrap;

function noopWrap(originalHandler) {
  return originalHandler;
}
