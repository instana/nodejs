/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

/**
 * The basic eslint configuration for production code. Eslint configs in the individual packages * implicitly inherit
 * from this configuration.
 */
module.exports = {
  extends: ['airbnb-base', 'plugin:monorepo-cop/recommended'],

  env: {
    es6: true,
    node: true
  },

  parserOptions: {
    // With Node.js 10 as the minimum required Node.js version, ES 2018 is appropriate, see  https://node.green/#ES2018.
    ecmaVersion: 2018,
    sourceType: 'script'
  },

  plugins: ['header', 'instana', 'mocha', 'monorepo-cop'],

  rules: {
    'arrow-parens': 'off',
    'arrow-body-style': 'off',
    'comma-dangle': ['error', 'never'],
    'class-methods-use-this': 'off',
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
        { pattern: '(?: \\(c\\) Copyright Instana Inc. and contributors \\d{4})?' },
        { pattern: '' }
      ]
    ],
    'implicit-arrow-linebreak': 'off',
    'import/newline-after-import': 'off',
    'import/no-dynamic-require': 'off',
    'import/order': 'off',
    indent: 'off',
    'instana/no-unsafe-require': 'error',
    'max-classes-per-file': 'off',
    'max-len': ['error', 120, 2],
    'mocha/no-exclusive-tests': 'error',
    'new-cap': 'off',
    'no-confusing-arrow': 'off',
    'no-console': 'error',
    'no-const-assign': 'error',
    'no-continue': 'off',
    'no-dupe-class-members': 'error',
    'no-else-return': 'off',
    'no-labels': 'off',
    'no-multi-assign': 'off',
    'no-param-reassign': 'off',
    'no-plusplus': 'off',
    'no-restricted-globals': 'off',
    'no-underscore-dangle': 'off',
    'no-use-before-define': ['error', 'nofunc'],
    'no-var': 'error',
    'object-curly-newline': 'off',
    'object-shorthand': 'off',
    'operator-linebreak': 'off',
    'prefer-arrow-callback': 'off',
    'prefer-const': [
      'error',
      {
        destructuring: 'all'
      }
    ],
    'prefer-destructuring': 'off',
    'prefer-object-spread': 'off',
    'prefer-rest-params': 'off',
    'prefer-spread': 'off',
    'prefer-template': 'off',
    strict: ['error', 'global'],
    'wrap-iife': 'off',
    yoda: 'off'
  }
};
