/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const context = require('./context');
const transformers = require('./transformers');
const semconv = require('./semconv');

/**
 * @param {Object} config
 */
function init(config) {
  context.init(config);
}

module.exports = {
  context,
  transformers,
  semconv,
  init
};
