/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

// Helpful links:
// - Conventional Commits: https://www.conventionalcommits.org/en/v1.0.0/
// - commitlint: https://github.com/conventional-changelog/commitlint
// - Configuration: https://github.com/conventional-changelog/commitlint/blob/master/docs/reference-rules.md

module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'body-max-line-length': [0, 'always', 100], // This is the body length! Disabled!
    'header-max-length': [2, 'always', 100], // This is the title/header length! Enabled!
    'footer-max-line-length': [0, 'always', 100] // Footer line length disabled
  }
};
