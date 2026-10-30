/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

exports.POINT_TYPES = {
  SINGLE: 'single',
  HEAP_SPACE: 'heapSpace',
  HISTOGRAM: 'histogram'
};

exports.METRIC_TYPES = {
  GAUGE: 'gauge',
  UPDOWNCOUNTER: 'updowncounter',
  HISTOGRAM: 'histogram'
};

exports.METRIC_UNITS = {
  SECONDS: 's',
  BYTES: 'By',
  RESOURCES: '{resource}'
};

exports.OTLP_AGGREGATION_TEMPORALITY = {
  DELTA: 1,
  CUMULATIVE: 2
};
