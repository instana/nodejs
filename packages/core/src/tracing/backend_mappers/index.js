/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

module.exports = {
  get transform() {
    return (/** @type {import('../../core').InstanaBaseSpan} */ span) => {
      return require('./mapper').transform(span);
    };
  }
};
