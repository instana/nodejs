'use strict';

const instrument = require('cls-bluebird');
const requireHook = require('../../../util/requireHook');
const cls = require('../../cls');

exports.activate = function activate() {
  // nothing to do
};

exports.deactivate = function deactivate() {
  // nothing to do
};

exports.init = function init() {
  requireHook.onModuleLoad('bluebird', patchBluebird);
};

function patchBluebird(bluebirdModule) {
  instrument(cls.ns, bluebirdModule);
}
