/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const requestMethod = 'default-style';
const version = '@aws-sdk/client-dynamodb';

describe('tracing/cloud/aws-sdk/v3/dynamodb', function () {
  require('../test_definition').call(this, version, requestMethod);
});
