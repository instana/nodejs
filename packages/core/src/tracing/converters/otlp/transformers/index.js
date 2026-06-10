/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/**
 * Transformers Module - Main Entry Point
 *
 * This module provides a centralized export point for all transformer functions
 * that convert Instana span data to OTLP format.
 *
 * Transformers:
 * - metaAttributes: Converts Instana base fields (IDs, timestamps, kind, name, status)
 * - resourceAttributes: Creates resource attributes (service name, SDK info)
 * - spanDataAttributes: Extracts and converts span.data to OTLP attributes
 */

const spanMetaData = require('./spanMetaData');
const resourceAttributes = require('./resourceAttributes');
const spanAttributes = require('./spanAttributes');

module.exports = {
  spanMetaData,
  resourceAttributes,
  spanAttributes
};
