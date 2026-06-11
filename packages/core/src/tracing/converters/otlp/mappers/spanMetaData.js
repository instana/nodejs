/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const {
  convertSpanId,
  convertTraceId,
  convertSpanKind,
  convertTimestamp,
  convertDuration,
  convertEndTime,
  generateSpanName,
  generateSpanStatus
} = require('./helper');

const { getLookupConfig } = require('../semconv');
const OTLP = getLookupConfig();

// Build mappings dynamically based on the schema configuration
// This allows version-specific fields to be defined in overrides

const DIRECT_MAPPINGS = {
  t: { otlp: OTLP.metadata.TRACE_ID, transform: convertTraceId },
  s: { otlp: OTLP.metadata.SPAN_ID, transform: convertSpanId },
  p: { otlp: OTLP.metadata.PARENT_ID, transform: convertSpanId },
  k: { otlp: OTLP.metadata.SPAN_KIND, transform: convertSpanKind }
};

// Handle timestamp field (version-specific)
if (OTLP.metadata.START_TIME_UNIX_NANO) {
  // v1.23: uses start_time_unix_nano
  DIRECT_MAPPINGS.ts = { otlp: OTLP.metadata.START_TIME_UNIX_NANO, transform: convertTimestamp };
} else if (OTLP.metadata.TIMESTAMP) {
  // latest: uses timestamp
  DIRECT_MAPPINGS.ts = { otlp: OTLP.metadata.TIMESTAMP, transform: convertTimestamp };
}

// Handle duration field (version-specific)
if (OTLP.metadata.DURATION) {
  // latest: duration is a direct field
  DIRECT_MAPPINGS.d = { otlp: OTLP.metadata.DURATION, transform: convertDuration };
}

const COMPUTED_MAPPINGS = [
  { otlp: OTLP.metadata.NAME, compute: generateSpanName },
  { otlp: OTLP.metadata.STATUS, compute: generateSpanStatus },
  // Instana spans do not currently expose event or link data.
  // Export empty arrays to remain OTLP-compliant.
  { otlp: OTLP.metadata.EVENTS, compute: () => [] },
  { otlp: OTLP.metadata.LINKS, compute: () => [] }
];

// Handle end time field (version-specific)
if (OTLP.metadata.END_TIME_UNIX_NANO) {
  // v1.23: end_time_unix_nano is computed from start_time + duration
  COMPUTED_MAPPINGS.push({
    otlp: OTLP.metadata.END_TIME_UNIX_NANO,
    compute: span => convertEndTime(span.d, span)
  });
}

module.exports = {
  DIRECT_MAPPINGS,
  COMPUTED_MAPPINGS
};

// Made with Bob
