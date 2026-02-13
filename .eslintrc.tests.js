/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

/**
 * The basic eslint configuration for all tests. Eslint configs in the individual /test directories in the packages
 * explicitly inherit from this configuration via extends.
 */
module.exports = {
  extends: './.eslintrc.js',
  // see https://github.com/eslint/eslint/issues/13385#issuecomment-641252879
  root: true,

  env: {
    mocha: true
  },

  rules: {
    // we routinely use dependencies from the root package.json in tests
    'import/no-extraneous-dependencies': 'off',
    // this custom rule is only meant for production code
    'instana/no-unsafe-require': 'off',
    // tests can freely require dependencies from other packages via relative path
    'monorepo-cop/no-relative-import-outside-package': 'off',
    'no-unused-expressions': 'off',
    'no-console': 'off',
    'max-len': 'off'
  }
};
