/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

// Registry of the AWS services that `cleanup-aws` can clean up.
module.exports = {
  lambda: require('./lambda')
};
