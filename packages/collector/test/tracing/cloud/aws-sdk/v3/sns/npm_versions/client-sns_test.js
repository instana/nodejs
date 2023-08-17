/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const npmVersion = '@aws-sdk/client-sns';

describe.only('tracing/cloud/aws-sdk/v3/sns', function () {
  require('../test_definition').bind(this)(npmVersion);
});
