'use strict';

exports.wrap = noopWrap;

function noopWrap(config, originalHandler) {
  if (arguments.length === 1) {
    originalHandler = config;
  }
  return originalHandler;
}
