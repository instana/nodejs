/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const converter = require('./converter');

/**
 * @param {Object} config
 */
function init(config) {
  converter.init(config);
}

/**
 * @param {Object[]} spans
 */
function transform(spans) {
  return converter.convert(spans);
}

module.exports = {
  init,
  transform
};
