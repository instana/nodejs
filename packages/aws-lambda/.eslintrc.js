/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

module.exports = {
  extends: ['airbnb-base', 'plugin:monorepo-cop/recommended'],

  root: true,

  env: {
    node: true
  },

  parserOptions: {
    sourceType: 'script'
  },

  plugins: ['instana', 'mocha', 'monorepo-cop'],

  rules: {
    'arrow-parens': 'off',
    'comma-dangle': 'off',
    eqeqeq: ['error', 'allow-null'],
    'func-names': 'error',
    'function-paren-newline': 'off',
    'global-require': 'off',
    'implicit-arrow-linebreak': 'off',
    'instana/no-unsafe-require': 'error',
    'max-len': ['error', 120, 2],
    'mocha/no-exclusive-tests': 'error',
    'no-confusing-arrow': 'off',
    'no-console': 'error',
    'no-else-return': 'off',
    'no-multi-assign': 'off',
    'no-param-reassign': 'off',
    'no-plusplus': 'off',
    'no-restricted-globals': 'off',
    'no-underscore-dangle': 'off',
    'no-use-before-define': ['error', 'nofunc'],
    'object-curly-newline': 'off',
    'operator-linebreak': 'off',
    'prefer-destructuring': 'off',
    'prefer-rest-params': 'off',
    'prefer-spread': 'off',
    'space-before-function-paren': 'off',
    strict: ['error', 'global']
  }
};
