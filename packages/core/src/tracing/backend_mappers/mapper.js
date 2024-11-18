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
 * @param {string} spanName
 * @returns {Function|null}
 */
function loadMapper(spanName) {
  if (cachedMappers[spanName]) {
    return cachedMappers[spanName];
  }

  try {
    // Ensures mapper files follow the same naming convention.
    const mapper = require(`./${spanName}_mapper.js`).transform;
    cachedMappers[spanName] = mapper;
    return mapper;
  } catch (err) {
    return null;
  }
}

/**
 * @param {import('../../core').InstanaBaseSpan} span
 * @returns {import('../../core').InstanaBaseSpan}
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
