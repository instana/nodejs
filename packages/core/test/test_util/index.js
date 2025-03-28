/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

/* eslint-disable consistent-return */

'use strict';

const commonVerifications = require('./common_verifications');
const isCI = require('./is_ci');

module.exports = {
  getCircularList: require('./circular_list').getCircularList,
  delay: require('./delay'),
  expectAtLeastOneMatching: require('./expectAtLeastOneMatching'),
  expectExactlyNMatching: require('./expectExactlyNMatching'),
  expectExactlyOneMatching: require('./expectExactlyOneMatching'),
  getSpansByName: require('./getSpansByName'),
  getTestAppLogger: require('./log').getLogger,
  createFakeLogger: () => {
    return {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      trace: () => {}
    };
  },
  isCILongRunning: () => {
    return process.env.CI_LONG_RUNNING;
  },
  isCI,
  retry: require('./retry'),
  retryUntilSpansMatch: require('./retryUntilSpansMatch'),
  runCommandSync: require('./runCommand').runCommandSync,
  sendToParent: require('./sendToParent'),
  stringifyItems: require('./stringifyItems'),
  mockRequire: require('./mockRequire'),
  loadExpress4: require('./load-express-v4'),
  checkESMApp: require('./check_esm_app'),
  ...commonVerifications
};
