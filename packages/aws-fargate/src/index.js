/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const path = require('path');
// MAINTENANCE NOTE: All code in this file needs to be compatible with all Node.js versions >= 6.0.0.

try {
  console.log('@instana/aws-fargate module version:', require(path.join(__dirname, '..', 'package.json')).version);
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
    module.exports = exports = require('./preactivate');
  } else if (majorVersion >= 6 && majorVersion < 10) {
    // eslint-disable-next-line no-console
    console.log(
      `@instana/aws-fargate has detected an outdated Node.js runtime version (${nodeJsVersion}), falling back to` +
        ' package version 1.x. We strongly recommend to pin the major version of the base image ' +
        'icr.io/instana/aws-fargate-nodejs. See ' +
        'https://www.ibm.com/docs/en/obi/current?topic=agents-monitoring-aws-fargate#versioning.'
    );

    // Maintenance note: As long as we do not backport the changes to index.js and the additional preactivate.js file to
    // the 1.x branch, this needs to point to:
    //   /instana/legacy-1x/node_modules/@instana/aws-fargate/src/index
    // Because in 1.x, src/index either delegates to src/activate or src/noop.
    //
    // If we ever include those changes into the 1.x version (which we should not), we would need to point to:
    //   /instana/legacy-1x/node_modules/@instana/aws-fargate/src/preactivate
    // Otherwise we would get into an endless require loop.
    //
    // eslint-disable-next-line
    module.exports = exports = require('/instana/legacy-1x/node_modules/@instana/aws-fargate/src/index');
  }
  // Node.js versions < 6 are unsupported and will not be instrumented at all.
} catch (e) {
  // ignore all runtime errors
  // eslint-disable-next-line no-console
  console.error(e);
}
