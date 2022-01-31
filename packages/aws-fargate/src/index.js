/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

// MAINTENANCE NOTE: All code in this file needs to be compatible with all Node.js versions >= 6.0.0.

try {
  const nodeJsVersion = process.version;
  if (typeof nodeJsVersion !== 'string') {
    return;
  }
  const matchResult = /v(\d+)\.(\d+)\.(\d+)/.exec(nodeJsVersion);
  if (!matchResult || matchResult.length < 4) {
    return;
  }
  const majorVersion = parseInt(matchResult[1], 10);
  if (majorVersion == null || isNaN(majorVersion)) {
    return;
  }
  if (majorVersion >= 10) {
    module.exports = exports = require('./preactivate.js');
    return;
  } else if (majorVersion >= 6 && majorVersion < 10) {
    // Maintenance note: As long as we do not backport the changes to index.js and the additional preactivate.js file to
    // the 1.x branch, this needs to point to:
    //   /instana/legacy-1x/node_modules/@instana/aws-fargate/src/index
    // Because in 1.x, src/index either delegates to src/activate or src/noop.
    //
    // If we ever include those changes into the 1.x version (which we should not), we would need to point to:
    //   /instana/legacy-1x/node_modules/@instana/aws-fargate/src/preactivate
    // Otherwise we would get into an endless require loop.
    //
    // eslint-disable-next-line instana/no-unsafe-require
    module.exports = exports = require('/instana/legacy-1x/node_modules/@instana/aws-fargate/src/index');
    return;
  }
  // Node.js versions < 6 are unsupported and will not be instrumented at all.
} catch (e) {
  // ignore all runtime errors
  // eslint-disable-next-line no-console
  console.error(e);
}
