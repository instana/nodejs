/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const path = require('path');
const { esm: esmUtil } = require('@instana/core/src/util');

// Check for unsupported ESM loader configurations and exit early
if (esmUtil.hasExperimentalLoaderFlag()) {
  // eslint-disable-next-line no-console
  console.error(
    'Node.js introduced breaking changes in versions 18.19.0 and above, leading to the discontinuation of support ' +
      `for the --experimental-loader flag by Instana. The current Node.js version is ${process.version} and ` +
      'this process will not be monitored by Instana. ' +
      "To ensure tracing by Instana, please use the '--import' flag instead. For more information, " +
      'refer to the Instana documentation: ' +
      'https://www.ibm.com/docs/en/instana-observability/current?topic=nodejs-collector-installation.'
  );
  return;
}

// This loader worked with '--experimental-loader' in Node.js versions below 18.19.
// TODO: Remove 'esm-loader.mjs' file and this log in the next major release (v6).
if (esmUtil.hasEsmLoaderFile()) {
  // eslint-disable-next-line no-console
  console.error(
    "Detected use of 'esm-loader.mjs'. This file is no longer supported and will be removed in next major release. " +
      'This process will not be monitored by Instana. ' +
      "To ensure tracing by Instana, please use the 'esm-register.mjs' file instead. For more information, " +
      'refer to the Instana documentation: ' +
      'https://www.ibm.com/docs/en/instana-observability/current?topic=nodejs-collector-installation.'
  );
  return;
}

try {
  // eslint-disable-next-line no-console
  console.log('@instana/aws-fargate module version:', require(path.join(__dirname, '..', 'package.json')).version);
  module.exports = exports = require('./preactivate');
} catch (e) {
  // ignore all runtime errors
  // eslint-disable-next-line no-console
  console.error(e);
}
