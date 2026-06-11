/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/**
 * OTLP Traces Transformers Module - Signal Entry Point
 *
 * This module acts as the centralized aggregation point for trace-specific
 * transformation routines converting Instana span footprints to OTLP compliance format.
 *
 * Sub-Components:
 * - spanMetaData: Parses base context envelopes (IDs, nano time-scales, kinds, statuses)
 * - spanAttributes: Processes protocol specific block definitions (HTTP, RPC, messaging, DBs)
 */

const spanMetaData = require('./spanMetaData');
const spanAttributes = require('./spanAttributes');

module.exports = {
  spanMetaData,
  spanAttributes
};
