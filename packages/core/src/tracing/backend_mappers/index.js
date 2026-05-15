/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const mapper = require('./mapper');

/**
 * Backend mapper transforms - converts internal span fields to backend format
 */
module.exports = {
  transform: mapper.transform
};
