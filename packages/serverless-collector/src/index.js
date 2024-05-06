/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const { isNodeJsTooOld, minimumNodeJsVersion } = require('@instana/core/src/util/nodeJsVersionCheck');

if (isNodeJsTooOld()) {
  // eslint-disable-next-line no-console
  console.error(
    `The package @instana/serverless-collector requires at least Node.js ${minimumNodeJsVersion} but this` +
      `process is running on Node.js ${process.version}. This process will not be traced by Instana.`
  );
  module.exports = exports = require('./noop');
}

const { util: coreUtil } = require('@instana/core');
const { environment: environmentUtil } = require('@instana/serverless');

const isExcludedFromInstrumentation = coreUtil.excludedFromInstrumentation && coreUtil.excludedFromInstrumentation();

if (!isExcludedFromInstrumentation) {
  environmentUtil.validate();
}

if (!isExcludedFromInstrumentation && environmentUtil.isValid()) {
  module.exports = exports = require('./activate');
} else {
  module.exports = exports = require('./noop');
}
