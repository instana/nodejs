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
      /** @type {import('../../../core').InstanaBaseSpan[]} */
      spans
    ) => {
      try {
        return converter.convert(spans);
      } catch (error) {
        return spans;
      }
    };
  }
};
