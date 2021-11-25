/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

module.exports = {
  rules: {
    'no-unsafe-require': require('./lib/rules/no-unsafe-require')
  },
  configs: {
    all: {
      plugins: ['instana'],
      rules: {
        'instana/no-unsafe-require': 'error'
      }
    }
  }
};
