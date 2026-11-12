/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

// Registry of the AWS services that `cleanup-aws` can clean up. To add a service (e.g. s3), create a module in this
// directory that exports `label`, `list(credentials, region, { prefix, callerArn })` (returning [{ id, details }])
// and `remove(credentials, region, resource)`, and register it here.
module.exports = {
  lambda: require('./lambda')
};
