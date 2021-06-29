/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

module.exports = {
  applicationUnderMonitoring: require('./applicationUnderMonitoring'),
  atMostOnce: require('./atMostOnce'),
  buffer: require('./buffer'),
  clone: require('./clone'),
  compression: require('./compression'),
  excludedFromInstrumentation: require('./excludedFromInstrumentation'),
  hasThePackageBeenInitializedTooLate: require('./initializedTooLateHeuristic'),
  normalizeConfig: require('./normalizeConfig'),
  propertySizes: require('./propertySizes'),
  requireHook: require('./requireHook'),
  slidingWindow: require('./slidingWindow'),
  stackTrace: require('./stackTrace')
};
