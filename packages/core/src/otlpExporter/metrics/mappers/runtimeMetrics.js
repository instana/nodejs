/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const ctx = require('../../common/context');
const { METRIC_TYPES, METRIC_UNITS } = require('./constants');

const OTLP = /** @type {any} */ (ctx.semConv);

/**
 * @typedef {Object} MetricDataPointMapping
 * @property {string} instana      - dot-path into the Instana payload (e.g. 'gc.gcPause')
 * @property {Record<string,any>} attributes  - fixed OTel attribute set for this data point
 * @property {(value: any) => any} [transform] - optional value transform
 */

/**
 * @typedef {Object} MetricMapping
 * @property {string} name           - OTel metric name (from semConv)
 * @property {string} unit           - OTel unit string
 * @property {string} type           - 'gauge' | 'updowncounter' | 'histogram'
 * @property {string} instanaPrefix  - top-level key in the Instana payload that must exist
 * @property {(payload: Record<string,any>) => Array<{attributes: Record<string,any>, value: any}> | null} dataPoints
 *   - returns the data-point array for this metric, or null when the source field is absent
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
      return [
        {
          attributes: { [OTLP.metrics.v8js.attributes.GC_TYPE]: 'all' },
          value: { count: 1, sum: gc.gcPause / 1000 }
        }
      ];
    }
  },

  {
    name: OTLP.metrics.v8js.HEAP_SPACE_AVAILABLE_SIZE,
    unit: METRIC_UNITS.BYTES,
    type: METRIC_TYPES.UPDOWNCOUNTER,
    instanaPrefix: 'heapSpaces',
    dataPoints(payload) {
      const heapSpaces = payload.heapSpaces;
      if (!heapSpaces || typeof heapSpaces !== 'object') return null;
      const points = Object.entries(heapSpaces)
        .filter(([, s]) => s && typeof s.available === 'number')
        .map(([name, s]) => ({ attributes: { [OTLP.metrics.v8js.attributes.HEAP_SPACE_NAME]: name }, value: s.available }));
      return points.length ? points : null;
    }
  },

  {
    name: OTLP.metrics.v8js.HEAP_SPACE_PHYSICAL_SIZE,
    unit: METRIC_UNITS.BYTES,
    type: METRIC_TYPES.UPDOWNCOUNTER,
    instanaPrefix: 'heapSpaces',
    dataPoints(payload) {
      const heapSpaces = payload.heapSpaces;
      if (!heapSpaces || typeof heapSpaces !== 'object') return null;
      const points = Object.entries(heapSpaces)
        .filter(([, s]) => s && typeof s.physical === 'number')
        .map(([name, s]) => ({ attributes: { [OTLP.metrics.v8js.attributes.HEAP_SPACE_NAME]: name }, value: s.physical }));
      return points.length ? points : null;
    }
  },

  {
    name: OTLP.metrics.v8js.HEAP_SPACE_SIZE,
    unit: METRIC_UNITS.BYTES,
    type: METRIC_TYPES.UPDOWNCOUNTER,
    instanaPrefix: 'heapSpaces',
    dataPoints(payload) {
      const heapSpaces = payload.heapSpaces;
      if (!heapSpaces || typeof heapSpaces !== 'object') return null;
      const points = Object.entries(heapSpaces)
        .filter(([, s]) => s && typeof s.current === 'number')
        .map(([name, s]) => ({ attributes: { [OTLP.metrics.v8js.attributes.HEAP_SPACE_NAME]: name }, value: s.current }));
      return points.length ? points : null;
    }
  },

  {
    name: OTLP.metrics.v8js.HEAP_USED,
    unit: METRIC_UNITS.BYTES,
    type: METRIC_TYPES.UPDOWNCOUNTER,
    instanaPrefix: 'heapSpaces',
    dataPoints(payload) {
      const heapSpaces = payload.heapSpaces;
      if (!heapSpaces || typeof heapSpaces !== 'object') return null;
      const points = Object.entries(heapSpaces)
        .filter(([, s]) => s && typeof s.used === 'number')
        .map(([name, s]) => ({ attributes: { [OTLP.metrics.v8js.attributes.HEAP_SPACE_NAME]: name }, value: s.used }));
      return points.length ? points : null;
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
      return [{ attributes: { [OTLP.metrics.v8js.attributes.RESOURCE_TYPE]: 'all' }, value: ar.count }];
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
      return [{ attributes: {}, value: libuv.min / 1000 }];
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
      return [{ attributes: {}, value: libuv.max / 1000 }];
    }
  },

  {
    // Derived: sum / num.  Requires num > 0.
    name: OTLP.metrics.nodejs.EVENTLOOP_DELAY_MEAN,
    unit: METRIC_UNITS.SECONDS,
    type: METRIC_TYPES.GAUGE,
    instanaPrefix: 'libuv',
    dataPoints(payload) {
      const libuv = payload.libuv;
      if (!libuv || typeof libuv.sum !== 'number' || typeof libuv.num !== 'number' || libuv.num === 0) return null;
      return [{ attributes: {}, value: libuv.sum / libuv.num / 1000 }];
    }
  }
];

module.exports = {
  metricMappings: [...v8Mappings, ...nodejsMappings]
};
