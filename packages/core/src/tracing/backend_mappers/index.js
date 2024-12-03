/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

module.exports = {
  get transform() {
    return (/** @type {import('../../core').InstanaBaseSpan} */ span) => {
      try {
        return require(`./${span.n}_mapper`).transform(span);
      } catch {
        return span;
      }
    };
  }
};
