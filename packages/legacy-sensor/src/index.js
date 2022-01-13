/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const instanaNodeJsCollector = require('@instana/collector');

// eslint-disable-next-line no-console
console.warn(
  'The package instana-nodejs-sensor has been renamed to @instana/collector. Please replace the dependency ' +
    '"instana-nodejs-sensor" in your package.json file with "@instana/collector". ' +
    'See https://www.ibm.com/docs/de/obi/current?topic=nodejs-collector-installation#change-of-package-name ' +
    'for details.'
);

module.exports = exports = instanaNodeJsCollector;
