/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

module.exports = {
  rules: {
    // We do not run npm install in the example lambda directories on CI, so this check would fail for all dependencies
    // (the rule compares the require statements to what is acutally present in node_modules).
    'import/no-unresolved': 'off',
    'instana/no-unsafe-require': 'off',
    'no-console': 'off'
  }
};
