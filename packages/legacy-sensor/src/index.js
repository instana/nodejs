'use strict';

var instanaNodeJsCollector = require('@instana/collector');

// eslint-disable-next-line no-console
console.warn(
  'The package instana-nodejs-sensor has been renamed to @instana/collector. Please replace the dependency ' +
    '"instana-nodejs-sensor" in your package.json file with "@instana/collector". ' +
    'See https://www.instana.com/docs/ecosystem/node-js/installation/#change-of-package-name for details.'
);

module.exports = exports = instanaNodeJsCollector;
