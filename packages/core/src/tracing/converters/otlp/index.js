/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { convert } = require('./converter');

module.exports = {
  get transform() {
    return (/** @type {import('../../../core').InstanaBaseSpan[]} */ spans) => {
      try {
        return convert(spans);
      } catch (error) {
        return spans;
      }
    };
  }
};
