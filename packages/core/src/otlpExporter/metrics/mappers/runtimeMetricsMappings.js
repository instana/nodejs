/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const ctx = require('../../common/context');
const { METRIC_TYPES, METRIC_UNITS } = require('./constants');
const { msToSeconds, heapSpacePoints, singlePoint } = require('./util');

const OTLP = /** @type {any} */ (ctx.semConv);

/**
 * @typedef {Object} MetricDataPointMapping
 * @property {string} instana
 * @property {Record<string,any>} attributes
 * @property {(value: any) => any} [transform]
 */

/**
 * @typedef {Object} MetricMapping
 * @property {string} name
 * @property {string} unit
 * @property {string} type
 * @property {string} instanaPrefix
 * @property {(payload: Record<string,any>) => Array<{attributes: Record<string,any>, value: any}> | null} dataPoints
 */

/** @type {MetricMapping[]} */
const v8Mappings = [
  {
    name: OTLP.metrics.v8js.GC_DURATION,
    unit: METRIC_UNITS.SECONDS,
    type: METRIC_TYPES.HISTOGRAM,
    instanaPrefix: 'gc',
    dataPoints(payload) {
      const gc = payload.gc;
      if (!gc || typeof gc.gcPause !== 'number') return null;
      return singlePoint({ count: 1, sum: msToSeconds(gc.gcPause) }, { [OTLP.metrics.v8js.attributes.GC_TYPE]: 'all' });
    }
  },

  {
    name: OTLP.metrics.v8js.HEAP_SPACE_AVAILABLE_SIZE,
    unit: METRIC_UNITS.BYTES,
    type: METRIC_TYPES.UPDOWNCOUNTER,
    instanaPrefix: 'heapSpaces',
    dataPoints(payload) {
      return heapSpacePoints(payload.heapSpaces, 'available', OTLP.metrics.v8js.attributes.HEAP_SPACE_NAME);
    }
  },

  {
    name: OTLP.metrics.v8js.HEAP_SPACE_PHYSICAL_SIZE,
    unit: METRIC_UNITS.BYTES,
    type: METRIC_TYPES.UPDOWNCOUNTER,
    instanaPrefix: 'heapSpaces',
    dataPoints(payload) {
      return heapSpacePoints(payload.heapSpaces, 'physical', OTLP.metrics.v8js.attributes.HEAP_SPACE_NAME);
    }
  },

  {
    name: OTLP.metrics.v8js.HEAP_SPACE_SIZE,
    unit: METRIC_UNITS.BYTES,
    type: METRIC_TYPES.UPDOWNCOUNTER,
    instanaPrefix: 'heapSpaces',
    dataPoints(payload) {
      return heapSpacePoints(payload.heapSpaces, 'current', OTLP.metrics.v8js.attributes.HEAP_SPACE_NAME);
    }
  },

  {
    name: OTLP.metrics.v8js.HEAP_USED,
    unit: METRIC_UNITS.BYTES,
    type: METRIC_TYPES.UPDOWNCOUNTER,
    instanaPrefix: 'heapSpaces',
    dataPoints(payload) {
      return heapSpacePoints(payload.heapSpaces, 'used', OTLP.metrics.v8js.attributes.HEAP_SPACE_NAME);
    }
  },

  {
    name: OTLP.metrics.v8js.RESOURCE_ACTIVE,
    unit: METRIC_UNITS.RESOURCES,
    type: METRIC_TYPES.GAUGE,
    instanaPrefix: 'activeResources',
    dataPoints(payload) {
      const ar = payload.activeResources;
      if (!ar || typeof ar.count !== 'number') return null;
      return singlePoint(ar.count, { [OTLP.metrics.v8js.attributes.RESOURCE_TYPE]: 'all' });
    }
  }
];

/** @type {MetricMapping[]} */
const nodejsMappings = [
  {
    name: OTLP.metrics.nodejs.EVENTLOOP_DELAY_MIN,
    unit: METRIC_UNITS.SECONDS,
    type: METRIC_TYPES.GAUGE,
    instanaPrefix: 'libuv',
    dataPoints(payload) {
      const libuv = payload.libuv;
      if (!libuv || typeof libuv.min !== 'number') return null;
      return singlePoint(msToSeconds(libuv.min), {});
    }
  },

  {
    name: OTLP.metrics.nodejs.EVENTLOOP_DELAY_MAX,
    unit: METRIC_UNITS.SECONDS,
    type: METRIC_TYPES.GAUGE,
    instanaPrefix: 'libuv',
    dataPoints(payload) {
      const libuv = payload.libuv;
      if (!libuv || typeof libuv.max !== 'number') return null;
      return singlePoint(msToSeconds(libuv.max), {});
    }
  },

  {
    name: OTLP.metrics.nodejs.EVENTLOOP_DELAY_MEAN,
    unit: METRIC_UNITS.SECONDS,
    type: METRIC_TYPES.GAUGE,
    instanaPrefix: 'libuv',
    dataPoints(payload) {
      const libuv = payload.libuv;
      if (!libuv || typeof libuv.sum !== 'number' || typeof libuv.num !== 'number' || libuv.num === 0) return null;
      return singlePoint(msToSeconds(libuv.sum / libuv.num), {});
    }
  }
];

module.exports = {
  metricMappings: [...v8Mappings, ...nodejsMappings]
};
