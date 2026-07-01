/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const resource = require('../../common/transformers/resource');
const spanMetaData = require('./spanMetaData');
const spanAttributes = require('./spanAttributes');

module.exports = {
  resource,
  spanMetaData,
  spanAttributes
};
