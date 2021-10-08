/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

module.exports = {
  extends: ['airbnb/legacy', 'plugin:monorepo-cop/recommended'],

  env: {
    es6: true,
    node: true
  },

  parserOptions: {
    ecmaVersion: 2016,
    sourceType: 'script'
  },

  plugins: ['header', 'mocha', 'monorepo-cop'],

  rules: {
    'block-scoped-var': 'off',
    'class-methods-use-this': 'off',
    'comma-dangle': 'off',
    'consistent-return': 'off',
    eqeqeq: ['error', 'allow-null'],
    'func-names': 'off',
    'function-paren-newline': 'off',
    'global-require': 'off',
    'header/header': [
      'error',
      'block',
      [
        { pattern: '' },
        { pattern: ' \\(c\\) Copyright IBM Corp. \\d{4}' },
        { pattern: ' \\(c\\) Copyright Instana Inc. and contributors \\d{4}' },
        { pattern: '' }
      ]
    ],
    'id-length': 'off',
    'implicit-arrow-linebreak': 'off',
    indent: 'off',
    'max-classes-per-file': 'off',
    'max-len': ['error', 120, 2],
    'mocha/no-exclusive-tests': 'error',
    'new-cap': 'off',
    'newline-per-chained-call': 'off',
    'no-console': 'error',
    'no-const-assign': 'error',
    'no-continue': 'off',
    'no-else-return': 'off',
    'no-labels': 'off',
    'no-mixed-operators': 'off',
    'no-multi-assign': 'off',
    'no-multiple-empty-lines': 'off',
    'no-param-reassign': 'off',
    'no-plusplus': 'off',
    'no-restricted-globals': 'off',
    'no-underscore-dangle': 'off',
    'no-unused-expressions': 'off',
    'no-use-before-define': ['error', 'nofunc'],
    'no-var': 'error',
    'object-curly-newline': 'off',
    'object-curly-spacing': 'off',
    'operator-linebreak': 'off',
    'prefer-const': [
      'error',
      {
        destructuring: 'all'
      }
    ],
    'prefer-arrow-callback': 'off',
    'space-before-function-paren': 'off',
    strict: ['error', 'global'],
    'vars-on-top': 'off',
    'wrap-iife': 'off',
    yoda: 'off'
  },

  globals: {
    Promise: true
  }
};
