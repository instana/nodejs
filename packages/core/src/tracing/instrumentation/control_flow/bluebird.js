/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

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
