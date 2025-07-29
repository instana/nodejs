/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const mock = require('@instana/core/test/test_util/mockRequire');
const AZURE_BLOB_VERSION = process.env.AZURE_BLOB_VERSION;
const AZURE_BLOB_REQUIRE =
  process.env.AZURE_BLOB_VERSION === 'latest' ? '@azure/storage-blob' : `@azure/storage-blob-${AZURE_BLOB_VERSION}`;

if (AZURE_BLOB_REQUIRE !== '@azure/storage-blob') {
  mock('@azure/storage-blob', AZURE_BLOB_REQUIRE);
}
