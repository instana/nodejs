'use strict';

var logger = require('../../logger').getLogger('tracing/bluebird');
var cls = require('../cls');

exports.activate = function() {
  // nothing to do
};

exports.deactivate = function() {
  // nothing to do
};

exports.init = function() {
  try {
    require('cls-bluebird')(cls.ns);
  } catch (e) {
    logger.warn('Failed to instrument bluebird', e);
  }
};
