'use strict';

var instanaNodeJsCollector = require('@instana/collector');

// eslint-disable-next-line no-console
console.warn(
  'The package instana-nodejs-sensor has been renamed to @instana/collector. Please replace the dependency ' +
    '"instana-nodejs-sensor" in your package.json file with "@instana/collector". ' +
    // eslint-disable-next-line max-len
    'See https://github.com/instana/nodejs-sensor/blob/master/packages/collector/README.md#migrating-from-instana-nodejs-sensor-to-instanacollector for details.'
);

module.exports = exports = instanaNodeJsCollector;
