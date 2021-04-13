/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const { createEmptyUnsampled, fromInstanaIds } = require('./create');

module.exports = {
  create: fromInstanaIds,
  createEmptyUnsampled: createEmptyUnsampled,
  parse: require('./parse')
};
