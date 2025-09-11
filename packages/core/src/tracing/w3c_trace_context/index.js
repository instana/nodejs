/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const create = require('./create');
const parse = require('./parse');

/**
 * @param {import('../../config/normalizeConfig').InstanaConfig} config
 */
exports.init = function init(config) {
  parse.init(config);
};

exports.parse = parse.execute;
exports.create = create.fromInstanaIds;
exports.createEmptyUnsampled = create.createEmptyUnsampled;
