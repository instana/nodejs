/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

module.exports = {
  extends: '../../../.eslintrc.js',

  env: {
    es6: true,
    mocha: true
  },

  parserOptions: {
    ecmaVersion: 2018
  },

  rules: {
    'monorepo-cop/no-relative-import-outside-package': 'off'
  }
};
