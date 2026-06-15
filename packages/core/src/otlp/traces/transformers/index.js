/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/**
 * This module acts as the centralized aggregation point for trace-specific
 * transformation routines converting Instana span footprints to OTLP compliance format.
 *
 * Sub-Components:
 * - resource: Extracts and transforms resource attributes (from common/transformers)
 * - spanMetaData: Parses base context envelopes (IDs, nano time-scales, kinds, statuses)
 * - spanAttributes: Processes protocol specific block definitions (HTTP, RPC, messaging, DBs)
 */

const resource = require('../../common/transformers/resource');
const spanMetaData = require('./spanMetaData');
const spanAttributes = require('./spanAttributes');

module.exports = {
  resource,
  spanMetaData,
  spanAttributes
};
