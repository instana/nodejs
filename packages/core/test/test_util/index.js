/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

/* eslint-disable consistent-return */

'use strict';

const commonVerifications = require('./common_verifications');

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
      error: () => {}
    };
  },
  isCI: require('./is_ci'),
  retry: require('./retry'),
  retryUntilSpansMatch: require('./retryUntilSpansMatch'),
  runCommandSync: require('./runCommand').runCommandSync,
  sendToParent: require('./sendToParent'),
  stringifyItems: require('./stringifyItems'),
  mockRequire: require('./mockRequire'),
  ...commonVerifications
};
