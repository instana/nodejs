/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/**
 * Registry of supported OpenTelemetry instrumentations.
 * Maps instrumentation package names to their internal module names.
 *
 * NOTE: Please refrain from utilizing third-party instrumentations.
 *       Instead, opt for officially released instrumentations available in the OpenTelemetry
 *       repository at https://github.com/open-telemetry/opentelemetry-js-contrib.
 *       Third-party instrumentations typically bypass a review process,
 *       resulting in suboptimal code coverage and potential vulnerabilities.
 */
const instrumentations = {
  '@opentelemetry/instrumentation-fs': { name: 'fs' },
  '@opentelemetry/instrumentation-restify': { name: 'restify' },
  '@opentelemetry/instrumentation-socket.io': { name: 'socket.io' },
  '@opentelemetry/instrumentation-tedious': { name: 'tedious' },
  '@opentelemetry/instrumentation-oracledb': { name: 'oracle' },
  '@instana/instrumentation-confluent-kafka-javascript': { name: 'confluent-kafka' }
};

exports.getInstrumentations = () => {
  return instrumentations;
};

exports.getInstrumentationPackageNames = () => {
  return Object.keys(instrumentations);
};

/**
 * Preloads OpenTelemetry instrumentation packages to avoid lazy loading overhead.
 * This is particularly useful in AWS Lambda environments where cold start performance is critical.
 * Uses the package names from the instrumentations registry defined in this file.
 */
exports.preloadOtelInstrumentations = () => {
  const packageNames = Object.keys(instrumentations);

  // eslint-disable-next-line no-console
  console.log(`[Instana] Preloading ${packageNames.length} OpenTelemetry instrumentations...`);

  packageNames.forEach(packageName => {
    const pkgStart = Date.now();
    try {
      require(packageName);
      // eslint-disable-next-line no-console
      console.debug(`[PERF] [OTEL] [EARLY-PRELOAD] ${packageName} loaded in ${Date.now() - pkgStart}ms`);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.debug(`[PERF] [OTEL] [EARLY-PRELOAD] ${packageName} failed: ${e.message}`);
    }
  });
};
