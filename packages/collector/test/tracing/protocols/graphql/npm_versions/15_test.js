/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const graphqlMajorVersion = 15;

describe('tracing/graphql', function () {
  require('../test_definition').bind(this)(graphqlMajorVersion);
});
