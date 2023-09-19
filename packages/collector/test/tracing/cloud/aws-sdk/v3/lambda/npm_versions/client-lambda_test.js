/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const npmVersion = '@aws-sdk/client-lambda';

describe('tracing/cloud/aws-sdk/v3/lambda', function () {
  require('../test_definition').bind(this)(npmVersion);
});
