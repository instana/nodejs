/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

module.exports = {
  rules: {
    'no-console': 'off',
    'instana/no-unsafe-require': 'off',
    'import/no-extraneous-dependencies': ['error', { devDependencies: true }]
  }
};
