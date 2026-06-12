/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

function getConverter() {
  return require('./converter');
}

/**
 * @param {Object} config
 */
function init(config) {
  getConverter().init(config);
}

function transform(metrics) {
  return getConverter().convert(metrics);
}

module.exports = {
  init,
  transform,

  get setHostId() {
    return getConverter().setHostId;
  },

  get setPid() {
    return getConverter().setPid;
  }
};
