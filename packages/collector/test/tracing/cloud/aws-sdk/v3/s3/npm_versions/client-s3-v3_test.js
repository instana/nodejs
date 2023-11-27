/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const npmVersion = '@aws-sdk/client-s3-v3';

describe('tracing/cloud/aws-sdk/v3/s3', function () {
  require('../test_definition').bind(this)(npmVersion);
});
