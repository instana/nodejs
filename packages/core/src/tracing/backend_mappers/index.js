/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

/**
 * @type {Record<string, Function|null>}
 */
const cachedMappers = {};

/**
 * Dynamically require the mapper based on span.n.
 *
 * @param {string} spanName - The spanName name (e.g., 'redis', 'http').
 * @returns {Function|null} - The BE transformation function for the span.n
 */
function loadMapper(spanName) {
  if (cachedMappers[spanName]) {
    return cachedMappers[spanName];
  }

  try {
    // While adding a new mapper file, always expected in the same format.
    const mapper = require(`./${spanName}_mapper.js`).transform;
    cachedMappers[spanName] = mapper;
    return mapper;
  } catch (err) {
    return null;
  }
}

/**
 * @param {import('../../core').InstanaBaseSpan} span - The span object that needs to be processed.
 * @param {import('../../core').InstanaBaseSpan} span - The transformed span.
 */
function transform(span) {
  const transformFunction = loadMapper(span.n);

  if (transformFunction) {
    return transformFunction(span);
  } else {
    return span;
  }
}

module.exports = { transform };
