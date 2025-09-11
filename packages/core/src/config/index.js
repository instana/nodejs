/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const normalizeConfig = require('./normalizeConfig');
const configNormalizers = require('./configNormalizers');

/**
 * @param {import('../instanaCtr').InstanaCtrType} instanaCtr
 */
exports.init = instanaCtr => {
  normalizeConfig.init(instanaCtr);
  configNormalizers.init(instanaCtr);
};

exports.create = function () {
  return normalizeConfig.create(...arguments);
};

exports.configNormalizers = configNormalizers;
