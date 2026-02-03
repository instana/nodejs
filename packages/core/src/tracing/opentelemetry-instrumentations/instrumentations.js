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

/**
 * Preloads OpenTelemetry instrumentation packages and core dependencies to avoid lazy loading overhead.
 * This is particularly useful in AWS Lambda environments where cold start performance is affected by the lazy loading.
 */
exports.preload = () => {
  require('@opentelemetry/context-async-hooks');
  require('@opentelemetry/core');
  require('@opentelemetry/api');
  require('@opentelemetry/sdk-trace-base');

  const packageNames = Object.keys(instrumentations);
  packageNames.forEach(packageName => {
    require(packageName);
  });
};
