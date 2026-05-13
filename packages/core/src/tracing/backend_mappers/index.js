/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const mapper = require('./mapper');
const otlpMapper = require('../otlp_mapper/mapper');

/**
 * @param {(span: import('../../core').InstanaBaseSpan) => import('../../core').InstanaBaseSpan} transformer
 */
function createSafeTransform(transformer) {
  return (/** @type {import('../../core').InstanaBaseSpan} */ span) => {
    try {
      return transformer(span);
    } catch (error) {
      return span;
    }
  };
}

module.exports = {
  get transform() {
    return createSafeTransform(mapper.transform);
  },
  get otlpTransform() {
    return createSafeTransform(otlpMapper.transform);
  }
};
