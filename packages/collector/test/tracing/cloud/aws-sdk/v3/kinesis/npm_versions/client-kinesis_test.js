/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const npmVersion = '@aws-sdk/client-kinesis';

describe('tracing/cloud/aws-sdk/v3/kinesis', function () {
  require('../test_definition').bind(this)(npmVersion);
});
