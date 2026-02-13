/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

module.exports = function (name, version, isLatest) {
  const libraryEnv = { LIBRARY_VERSION: version, LIBRARY_NAME: name, LIBRARY_LATEST: isLatest };

  require('./test_combined').call(this, libraryEnv);
  require('./dynamodb/suite').call(this, libraryEnv);
  require('./kinesis/suite').call(this, libraryEnv);
  require('./lambda/suite').call(this, libraryEnv);
  require('./s3/suite').call(this, libraryEnv);
  require('./sns/suite').call(this, libraryEnv);
  require('./sqs/suite').call(this, libraryEnv);
};
