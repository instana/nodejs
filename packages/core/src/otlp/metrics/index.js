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
 * @param {any} metrics
 */
function transform(metrics) {
  return converter.convert(metrics);
}

module.exports = {
  init,
  transform,
  setHostId: converter.setHostId,
  setPid: converter.setPid
};
