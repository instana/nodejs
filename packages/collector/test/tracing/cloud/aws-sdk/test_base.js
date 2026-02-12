/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

module.exports = function (name, version, isLatest) {
  const libraryEnv = { LIBRARY_VERSION: version, LIBRARY_NAME: name, LIBRARY_LATEST: isLatest };

  require('./test_combined').call(this, libraryEnv);
  require('./dynamodb/test').call(this, libraryEnv);
  require('./kinesis/test').call(this, libraryEnv);
  require('./lambda/test').call(this, libraryEnv);
  require('./s3/test').call(this, libraryEnv);
  require('./sns/test').call(this, libraryEnv);
  require('./sqs/test').call(this, libraryEnv);
};
