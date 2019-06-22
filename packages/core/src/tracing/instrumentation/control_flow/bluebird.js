'use strict';

var instrument = require('cls-bluebird');
var requireHook = require('../../../util/requireHook');
var cls = require('../../cls');

exports.activate = function() {
  // nothing to do
};

exports.deactivate = function() {
  // nothing to do
};

exports.init = function() {
  requireHook.onModuleLoad('bluebird', patchBluebird);
};

function patchBluebird(bluebirdModule) {
  instrument(cls.ns, bluebirdModule);
}
