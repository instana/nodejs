/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const resource = require('../../common/transformers/resource');
const spanMetadata = require('./spanMetadata');
const spanAttributes = require('./spanAttributes');

module.exports = {
  resource,
  spanMetadata,
  spanAttributes
};
