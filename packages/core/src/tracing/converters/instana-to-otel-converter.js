/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/* eslint-disable no-console */

/**
  TEST FILE ONLY
 */

const fs = require('fs');
const { convertInstanaSpanToOTLP, convertInstanaSpanBatchToOTLP } = require('./otlp');

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * @typedef {import('./otel-span').OtelSpan} OtelSpan
 * @typedef {import('./otel-span').OtelAttribute} OtelAttribute
 */

// ============================================================================
// Wrapper Functions (for backward compatibility)
// ============================================================================

/**
 * Converts an Instana span to OpenTelemetry format
 * This is now a wrapper around the function-based converter
 *
 * @param {import('../../core').InstanaBaseSpan} instanaSpan - The Instana span
 * @returns {OtelSpan} OpenTelemetry formatted span
 */
function convertInstanaToOtel(instanaSpan) {
  return convertInstanaSpanToOTLP(instanaSpan);
}

/**
 * Converts multiple Instana spans to OTLP format with resourceSpans structure
 * This is the main entry point called from spanBuffer.js
 *
 * @param {Array<import('../../core').InstanaBaseSpan>} instanaSpans - Array of Instana spans
 * @returns {Object} OTLP traces object with resourceSpans
 */
function convertBatch(instanaSpans) {
  return convertInstanaSpanBatchToOTLP(instanaSpans);
}

// ============================================================================
// CLI Interface (for testing/debugging)
// ============================================================================

/**
 * Main CLI function
 */
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Instana to OpenTelemetry Span Converter

Usage:
  node instana-to-otel-converter.js <input-file.json> [output-file.json]
  
Arguments:
  input-file.json   - JSON file containing Instana span(s)
  output-file.json  - Optional output file (defaults to stdout)
  
Input Format:
  - Single span object: { t: "...", s: "...", ... }
  - Array of spans: [{ t: "...", s: "..." }, ...]
  
Examples:
  node instana-to-otel-converter.js instana-span.json
  node instana-to-otel-converter.js instana-spans.json otel-spans.json
    `);
    process.exit(0);
  }

  const inputFile = args[0];
  const outputFile = args[1];

  // Read input file
  if (!fs.existsSync(inputFile)) {
    console.error(`Error: Input file not found: ${inputFile}`);
    process.exit(1);
  }

  let inputData;
  try {
    const fileContent = fs.readFileSync(inputFile, 'utf8');
    inputData = JSON.parse(fileContent);
  } catch (error) {
    console.error(`Error reading input file: ${error.message}`);
    process.exit(1);
  }

  // Convert spans
  let outputData;
  try {
    if (Array.isArray(inputData)) {
      outputData = convertBatch(inputData);
    } else {
      outputData = convertInstanaToOtel(inputData);
    }
  } catch (error) {
    console.error(`Error converting spans: ${error.message}`);
    process.exit(1);
  }

  // Write output
  const outputJson = JSON.stringify(outputData, null, 2);

  if (outputFile) {
    try {
      fs.writeFileSync(outputFile, outputJson, 'utf8');
      console.log(`✓ Converted ${Array.isArray(inputData) ? inputData.length : 1} span(s)`);
      console.log(`✓ Output written to: ${outputFile}`);
    } catch (error) {
      console.error(`Error writing output file: ${error.message}`);
      process.exit(1);
    }
  } else {
    console.log(outputJson);
  }
}

// ============================================================================
// Module Exports
// ============================================================================

module.exports = {
  convertInstanaToOtel,
  convertBatch
};

// Run CLI if executed directly
if (require.main === module) {
  main();
}

// Made with Bob
