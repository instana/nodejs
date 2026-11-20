/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const converter = require('./converter');
const { isLogSpan } = require('../traces/util');

/**
 * @param {import('../../config').InstanaConfig} config
 */
function init(config) {
  converter.init(config);
}

/**
 * @param {import('../../core').InstanaBaseSpan[]} spans
 */
function transform(spans) {
  return converter.convert(spans);
}

module.exports = {
  init,
  transform,
  isLogSpan
};
