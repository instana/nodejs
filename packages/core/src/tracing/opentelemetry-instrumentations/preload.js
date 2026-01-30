/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/**
 * Preloads OpenTelemetry instrumentation packages to avoid lazy loading overhead.
 * This is particularly useful in AWS Lambda environments where cold start performance is critical.
 *
 * @param {string[]} packageNames
 */
function preloadOtelInstrumentations(packageNames) {
  if (!packageNames || !Array.isArray(packageNames)) {
    return;
  }

  packageNames.forEach(packageName => {
    try {
      require(packageName);
    } catch (e) {
      // @ts-ignore
    }
  });
}

module.exports = {
  preloadOtelInstrumentations
};
