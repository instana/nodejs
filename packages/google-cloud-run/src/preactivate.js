/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const { isNodeJsTooOld, minimumNodeJsVersion } = require('@instana/core/src/util/nodeJsVersionCheck');
const hasExperimentalLoaderFlag = require('@instana/core').tracing.hasExperimentalLoaderFlag;

if (isNodeJsTooOld()) {
  // eslint-disable-next-line no-console
  console.error(
    `The package @instana/google-cloud-run requires at least Node.js ${minimumNodeJsVersion} but this process is ` +
      `running on Node.js ${process.version}. This Google Cloud Run service will not be monitored by Instana.` +
      'See https://www.ibm.com/docs/en/instana-observability/current?topic=agents-google-cloud-run#versioning.'
  );
  return;
}

if (hasExperimentalLoaderFlag()) {
  // eslint-disable-next-line no-console
  console.error(
    "Instana no longer supports the '--experimental-loader' flag starting from Node.js 18.19.0. The current Node.js " +
      `version is ${process.version}. To be monitored by Instana, please use the '--import' flag instead. ` +
      'Refer to the Instana documentation for further details.'
  );
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
