/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const mapper = require('./mapper');
module.exports = {
  get transform() {
    return (/** @type {import('../../core').InstanaBaseSpan} */ span) => {
      try {
        return mapper.transform(span);
      } catch (error) {
        return span;
      }
    };
  }
};
