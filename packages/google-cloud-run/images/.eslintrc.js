/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

module.exports = {
  rules: {
    // We do not expect everybody who checks out the repository to run npm install in any of the subdirectories of
    // packages/google-cloud-run/images, so we need to ignore dependencies that have not been installed.
    'import/no-unresolved': 'off'
  }
};
