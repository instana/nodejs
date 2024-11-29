/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

Object.defineProperty(module.exports, 'transform', {
  get() {
    return (/** @type {import('../../core').InstanaBaseSpan} */ span) => {
      try {
        return require(`./${span.n}_mapper`).transform(span);
      } catch {
        return span;
      }
    };
  }
});
