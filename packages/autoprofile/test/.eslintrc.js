/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

module.exports = {
  extends: '../../../.eslintrc.js',

  env: {
    mocha: true
  },

  rules: {
    'monorepo-cop/no-relative-import-outside-package': 'off'
  }
};
