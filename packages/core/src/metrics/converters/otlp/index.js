/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const converter = require('./converter');

/**
 * @param {Object} config - Configuration object
 */
function init(config) {
  converter.init(config);
}

module.exports = {
  init,

  get transform() {
    return (
      /** @type {Object|Array} */
      metrics
    ) => {
      try {
        return converter.transform(metrics);
      } catch (error) {
        return { resourceMetrics: [] };
      }
    };
  },

  setHostId: converter.setHostId,
  setPid: converter.setPid
};
