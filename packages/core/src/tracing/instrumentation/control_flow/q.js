/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const hook = require('../../../util/hook');

let logger;
logger = require('../../../logger').getLogger('tracing/q', newLogger => {
  logger = newLogger;
});
exports.activate = function activate() {
  // nothing to do
};

exports.deactivate = function deactivate() {
  // nothing to do
};

exports.init = function init() {
  hook.onModuleLoad('q', logDeprecatedWarning);
};

function logDeprecatedWarning() {
  logger.warn(
    // eslint-disable-next-line max-len
    '[Deprecation Warning] The support for Q library is deprecated and will be removed in the next major release. Please consider using native promises instead.'
  );
}
