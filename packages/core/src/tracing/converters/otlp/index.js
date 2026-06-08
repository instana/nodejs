/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { convert } = require('./converter');

module.exports = {
  /**
   * @param {import("../../../core").InstanaBaseSpan[]} spans
   */
  transform(spans) {
    try {
      return convert(spans);
    } catch (error) {
      return spans;
    }
  }
};
