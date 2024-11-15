/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

/**
 * @type {Record<string, Function|null>}
 */
const cachedMappers = {};

/**
 * Dynamically require the mapper only if needed, based on span.n.
 * This method will only load the mapper file for the specific technology.
 *
 * @param {string} technology - The technology name (e.g., 'redis', 'http').
 * @returns {Function|null} - The transformation function for the technology or null if not found.
 */
function loadMapper(technology) {
  if (cachedMappers[technology]) {
    return cachedMappers[technology];
  }

  try {
    const mapper = require(`./${technology}_mapper.js`).transform;
    cachedMappers[technology] = mapper;

    return mapper;
  } catch (err) {
    return null; // Return null if the mapper doesn't exist or failed to load
  }
}

/**
 * A function that applies the transformation for the span based on span.n.
 * If no mapper is found, the span is returned unmodified without causing failure.
 *
 * @param {import('../../core').InstanaBaseSpan} span - The span object that needs to be processed.
 * @param {import('../../core').InstanaBaseSpan} span - The transformed span.
 */
function transform(span) {
  const technology = span.n;

  const transformFunction = loadMapper(technology);

  if (transformFunction) {
    return transformFunction(span);
  } else {
    return span;
  }
}

module.exports = { transform };
