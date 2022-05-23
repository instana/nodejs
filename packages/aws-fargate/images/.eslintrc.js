/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

module.exports = {
  rules: {
    // We do not expect everybody who checks out the repository to run npm install in any of the subdirectories of
    // packages/aws-fargate/images, so we need to ignore dependencies that have not been installed.
    'import/no-unresolved': 'off'
  }
};
