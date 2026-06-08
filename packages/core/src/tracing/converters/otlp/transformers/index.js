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

const { extractMetaDataAttributes } = require('./metaDataAttributes');
const { extractResourceAttributes } = require('./resourceAttributes');
const { extractDataAttributes } = require('./dataAttributes');

module.exports = {
  extractMetaDataAttributes,
  extractResourceAttributes,
  extractDataAttributes
};
