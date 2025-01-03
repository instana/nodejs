/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

module.exports = {
  applicationUnderMonitoring: require('./applicationUnderMonitoring'),
  atMostOnce: require('./atMostOnce'),
  clone: require('./clone'),
  compression: require('./compression'),
  ensureNestedObjectExists: require('./ensureNestedObjectExists'),
  excludedFromInstrumentation: require('./excludedFromInstrumentation'),
  hasThePackageBeenInitializedTooLate: require('./initializedTooLateHeuristic'),
  normalizeConfig: require('./normalizeConfig'),
  propertySizes: require('./propertySizes'),
  requireHook: require('./requireHook'),
  slidingWindow: require('./slidingWindow'),
  stackTrace: require('./stackTrace'),
  iitmHook: require('./iitmHook'),
  hook: require('./hook')
};
