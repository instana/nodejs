/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors
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
    'func-names': 'off',
    'no-unused-expressions': 'off',
    // some dependencies come from the root package.json
    'import/no-extraneous-dependencies': 'off',
    'instana/no-unsafe-require': 'off',
    'monorepo-cop/no-relative-import-outside-package': 'off',
    'prefer-object-spread': 'off'
  }
};
