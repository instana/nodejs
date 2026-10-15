/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const ctx = require('../../common/context');
const { POINT_TYPES, METRIC_TYPES, METRIC_UNITS } = require('../constants');
const { msToSeconds, computeMean } = require('./util');

const OTLP = /** @type {any} */ (ctx.semConv);

/**
 * Maps one Instana payload field to one OTLP data point.
 *
 * @typedef {Object} SinglePointMapping
 * @property {typeof import('../constants').POINT_TYPES.SINGLE} pointType
 * @property {string} name
 * @property {string} unit
 * @property {string} type
 * @property {string} instana
 * @property {Record<string, any>}  [attributes]
 * @property {(value: any, payload: Record<string, any>) => any} [transform]
 */

/**
 * Maps one Instana payload field to an OTLP histogram data point
 * (produces `{ count, sum }` instead of a plain number).
 *
 * @typedef {Object} HistogramMapping
 * @property {typeof import('../constants').POINT_TYPES.HISTOGRAM} pointType
 * @property {string} name
 * @property {string} unit
 * @property {string} type
 * @property {string} instana
 * @property {Record<string, any>}  [attributes]
 * @property {(value: any, payload: Record<string, any>) => any} [transform]
 */

/**
 * A fan-out metric — iterates over a map of heap spaces and emits one data point per space.
 *
 * @typedef {Object} HeapSpaceMapping
 * @property {typeof import('../constants').POINT_TYPES.HEAP_SPACE} pointType
 * @property {string} name
 * @property {string} unit
 * @property {string} type
 * @property {string} instana
 * @property {string} field
 * @property {string} attributeKey
 */

/**
 * @typedef {SinglePointMapping | HistogramMapping | HeapSpaceMapping} MetricMapping
 */

const OTLP_V8 = OTLP.metrics.v8js;
const OTLP_NODEJS = OTLP.metrics.nodejs;

/** @type {MetricMapping[]} */
const v8Mappings = [
  {
    pointType: POINT_TYPES.HISTOGRAM,
    name: OTLP_V8.GC_DURATION,
    unit: METRIC_UNITS.SECONDS,
    type: METRIC_TYPES.HISTOGRAM,
    instana: 'gc.gcPause',
    attributes: { [OTLP_V8.attributes.GC_TYPE]: 'all' },
    transform: msToSeconds
  },

  {
    pointType: POINT_TYPES.HEAP_SPACE,
    name: OTLP_V8.HEAP_SPACE_AVAILABLE_SIZE,
    unit: METRIC_UNITS.BYTES,
    type: METRIC_TYPES.UPDOWNCOUNTER,
    instana: 'heapSpaces',
    field: 'available',
    attributeKey: OTLP_V8.attributes.HEAP_SPACE_NAME
  },

  {
    pointType: POINT_TYPES.HEAP_SPACE,
    name: OTLP_V8.HEAP_SPACE_PHYSICAL_SIZE,
    unit: METRIC_UNITS.BYTES,
    type: METRIC_TYPES.UPDOWNCOUNTER,
    instana: 'heapSpaces',
    field: 'physical',
    attributeKey: OTLP_V8.attributes.HEAP_SPACE_NAME
  },

  {
    pointType: POINT_TYPES.HEAP_SPACE,
    name: OTLP_V8.HEAP_SPACE_SIZE,
    unit: METRIC_UNITS.BYTES,
    type: METRIC_TYPES.UPDOWNCOUNTER,
    instana: 'heapSpaces',
    field: 'current',
    attributeKey: OTLP_V8.attributes.HEAP_SPACE_NAME
  },

  {
    pointType: POINT_TYPES.HEAP_SPACE,
    name: OTLP_V8.HEAP_USED,
    unit: METRIC_UNITS.BYTES,
    type: METRIC_TYPES.UPDOWNCOUNTER,
    instana: 'heapSpaces',
    field: 'used',
    attributeKey: OTLP_V8.attributes.HEAP_SPACE_NAME
  },

  {
    pointType: POINT_TYPES.SINGLE,
    name: OTLP_V8.RESOURCE_ACTIVE,
    unit: METRIC_UNITS.RESOURCES,
    type: METRIC_TYPES.GAUGE,
    instana: 'activeResources.count',
    attributes: { [OTLP_V8.attributes.RESOURCE_TYPE]: 'all' }
  }
];

/** @type {MetricMapping[]} */
const nodejsMappings = [
  {
    pointType: POINT_TYPES.SINGLE,
    name: OTLP_NODEJS.EVENTLOOP_DELAY_MIN,
    unit: METRIC_UNITS.SECONDS,
    type: METRIC_TYPES.GAUGE,
    instana: 'libuv.min',
    attributes: {},
    transform: msToSeconds
  },

  {
    pointType: POINT_TYPES.SINGLE,
    name: OTLP_NODEJS.EVENTLOOP_DELAY_MAX,
    unit: METRIC_UNITS.SECONDS,
    type: METRIC_TYPES.GAUGE,
    instana: 'libuv.max',
    attributes: {},
    transform: msToSeconds
  },

  {
    pointType: POINT_TYPES.SINGLE,
    name: OTLP_NODEJS.EVENTLOOP_DELAY_MEAN,
    unit: METRIC_UNITS.SECONDS,
    type: METRIC_TYPES.GAUGE,
    instana: 'libuv',
    attributes: {},
    transform: ({ sum, num } = {}) => computeMean(sum, num)
  }
];

module.exports = {
  metricMappings: [...v8Mappings, ...nodejsMappings]
};
