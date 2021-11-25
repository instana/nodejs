/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

module.exports = {
  extends: '../.eslintrc.js',

  // see https://github.com/eslint/eslint/issues/13385#issuecomment-641252879
  root: true,

  env: {
    mocha: true
  },

  rules: {
    'instana/no-unsafe-require': 'off',
    'monorepo-cop/no-relative-import-outside-package': 'off'
  }
};
