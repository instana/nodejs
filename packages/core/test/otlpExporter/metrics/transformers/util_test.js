/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const expect = require('chai').expect;

const {
  formatAttributes,
  toOtlpNumericField,
  buildDataPoints,
  buildMetricEnvelope,
  resolveDataPoints,
  extractMappedMetrics
} = require('../../../../src/otlpExporter/metrics/transformers/util');

const {
  METRIC_TYPES,
  POINT_TYPES,
  OTLP_AGGREGATION_TEMPORALITY
} = require('../../../../src/otlpExporter/metrics/constants');

const TIME_MS = 1544712660300;
const TIME_NANO = String(TIME_MS * 1e6);

describe('otlpExporter/metrics/transformers/util', () => {
  describe('formatAttributes', () => {
    it('returns an empty array when called with no argument', () => {
      expect(formatAttributes()).to.deep.equal([]);
    });

    it('returns an empty array for an empty object', () => {
      expect(formatAttributes({})).to.deep.equal([]);
    });

    it('encodes a string value', () => {
      expect(formatAttributes({ env: 'prod' })).to.deep.equal([{ key: 'env', value: { stringValue: 'prod' } }]);
    });

    it('encodes an integer value', () => {
      expect(formatAttributes({ count: 3 })).to.deep.equal([{ key: 'count', value: { intValue: 3 } }]);
    });

    it('encodes a float value', () => {
      expect(formatAttributes({ ratio: 0.5 })).to.deep.equal([{ key: 'ratio', value: { doubleValue: 0.5 } }]);
    });

    it('encodes a boolean value', () => {
      expect(formatAttributes({ active: true })).to.deep.equal([{ key: 'active', value: { boolValue: true } }]);
    });

    it('encodes null as an empty stringValue', () => {
      expect(formatAttributes({ k: null })).to.deep.equal([{ key: 'k', value: { stringValue: '' } }]);
    });

    it('preserves key insertion order', () => {
      const result = formatAttributes({ b: 'second', a: 'first' });
      expect(result[0].key).to.equal('b');
      expect(result[1].key).to.equal('a');
    });
  });

  describe('toOtlpNumericField', () => {
    it('returns asInt for an integer', () => {
      expect(toOtlpNumericField(42)).to.deep.equal({ asInt: 42 });
    });

    it('returns asInt for zero', () => {
      expect(toOtlpNumericField(0)).to.deep.equal({ asInt: 0 });
    });

    it('returns asDouble for a float', () => {
      expect(toOtlpNumericField(0.5)).to.deep.equal({ asDouble: 0.5 });
    });

    it('returns asDouble for a negative float', () => {
      expect(toOtlpNumericField(-1.5)).to.deep.equal({ asDouble: -1.5 });
    });
  });

  describe('buildDataPoints', () => {
    it('builds a gauge data point with asInt for an integer value', () => {
      const result = buildDataPoints([{ value: 42, attributes: {} }], TIME_MS * 1e6, METRIC_TYPES.GAUGE);
      expect(result).to.deep.equal([{ asInt: 42, timeUnixNano: TIME_NANO, attributes: [] }]);
    });

    it('builds a gauge data point with asDouble for a float value', () => {
      const result = buildDataPoints([{ value: 0.582 }], TIME_MS * 1e6, METRIC_TYPES.GAUGE);
      expect(result[0]).to.deep.equal({ asDouble: 0.582, timeUnixNano: TIME_NANO, attributes: [] });
    });

    it('builds an updowncounter data point', () => {
      const result = buildDataPoints(
        [{ value: 100, attributes: { 'v8js.heap.space.name': 'old_space' } }],
        TIME_MS * 1e6,
        METRIC_TYPES.UPDOWNCOUNTER
      );
      expect(result[0].asInt).to.equal(100);
      expect(result[0].attributes[0].key).to.equal('v8js.heap.space.name');
    });

    it('builds a histogram data point with the correct OTLP shape', () => {
      const result = buildDataPoints(
        [{ value: 0.414, attributes: { 'v8js.gc.type': 'all' } }],
        TIME_MS * 1e6,
        METRIC_TYPES.HISTOGRAM
      );
      expect(result).to.deep.equal([
        {
          sum: 0.414,
          count: 1,
          bucketCounts: [1],
          explicitBounds: [],
          timeUnixNano: TIME_NANO,
          attributes: [{ key: 'v8js.gc.type', value: { stringValue: 'all' } }]
        }
      ]);
    });

    it('preserves order across multiple data points', () => {
      const raw = [
        { value: 10, attributes: { 'v8js.heap.space.name': 'new_space' } },
        { value: 20, attributes: { 'v8js.heap.space.name': 'old_space' } }
      ];
      const result = buildDataPoints(raw, TIME_MS * 1e6, METRIC_TYPES.UPDOWNCOUNTER);
      expect(result).to.have.length(2);
      expect(result[0].asInt).to.equal(10);
      expect(result[1].asInt).to.equal(20);
    });

    it('serialises timeUnixNano as a string', () => {
      const result = buildDataPoints([{ value: 1, attributes: {} }], TIME_MS * 1e6, METRIC_TYPES.GAUGE);
      expect(result[0].timeUnixNano).to.be.a('string');
    });
  });

  describe('buildMetricEnvelope', () => {
    const dataPoints = [{ asInt: 1, timeUnixNano: '123', attributes: [] }];

    it('wraps gauge in a gauge envelope', () => {
      expect(buildMetricEnvelope(METRIC_TYPES.GAUGE, dataPoints)).to.deep.equal({
        gauge: { dataPoints }
      });
    });

    it('wraps updowncounter in a cumulative sum envelope with isMonotonic false', () => {
      expect(buildMetricEnvelope(METRIC_TYPES.UPDOWNCOUNTER, dataPoints)).to.deep.equal({
        sum: {
          aggregationTemporality: OTLP_AGGREGATION_TEMPORALITY.CUMULATIVE,
          isMonotonic: false,
          dataPoints
        }
      });
    });

    it('wraps histogram in a delta histogram envelope', () => {
      expect(buildMetricEnvelope(METRIC_TYPES.HISTOGRAM, dataPoints)).to.deep.equal({
        histogram: {
          aggregationTemporality: OTLP_AGGREGATION_TEMPORALITY.DELTA,
          dataPoints
        }
      });
    });

    it('defaults to gauge for an unknown type', () => {
      expect(buildMetricEnvelope('unknown', dataPoints)).to.deep.equal({
        gauge: { dataPoints }
      });
    });
  });

  describe('resolveDataPoints', () => {
    describe('SINGLE point type', () => {
      const mapping = {
        pointType: POINT_TYPES.SINGLE,
        instana: 'activeResources.count',
        attributes: { 'v8js.resource.type': 'all' }
      };

      it('resolves a nested instana path to a single data point', () => {
        const result = resolveDataPoints(mapping, { activeResources: { count: 18 } });
        expect(result).to.deep.equal([{ attributes: { 'v8js.resource.type': 'all' }, value: 18 }]);
      });

      it('returns null when the path is missing', () => {
        expect(resolveDataPoints(mapping, {})).to.be.null;
      });

      it('returns null when the value is not a number and there is no transform', () => {
        expect(resolveDataPoints(mapping, { activeResources: { count: null } })).to.be.null;
      });
    });

    describe('SINGLE point type with transform', () => {
      const mapping = {
        pointType: POINT_TYPES.SINGLE,
        instana: 'libuv.min',
        attributes: {},
        transform: v => v / 1000
      };

      it('applies the transform and returns the converted value', () => {
        const result = resolveDataPoints(mapping, { libuv: { min: 500 } });
        expect(result).to.deep.equal([{ attributes: {}, value: 0.5 }]);
      });

      it('returns null when the transform returns null', () => {
        const nullTransform = { ...mapping, transform: () => null };
        expect(resolveDataPoints(nullTransform, { libuv: { min: 0 } })).to.be.null;
      });

      it('returns null when the transform returns NaN', () => {
        const nanTransform = { ...mapping, transform: () => NaN };
        expect(resolveDataPoints(nanTransform, { libuv: { min: 0 } })).to.be.null;
      });
    });

    describe('HISTOGRAM point type', () => {
      const mapping = {
        pointType: POINT_TYPES.HISTOGRAM,
        instana: 'gc.gcPause',
        attributes: { 'v8js.gc.type': 'all' },
        transform: v => v / 1000
      };

      it('resolves to a plain scalar value (shape applied later in buildDataPoints)', () => {
        const result = resolveDataPoints(mapping, { gc: { gcPause: 414 } });
        expect(result).to.deep.equal([{ attributes: { 'v8js.gc.type': 'all' }, value: 0.414 }]);
      });

      it('returns null when the source path is absent', () => {
        expect(resolveDataPoints(mapping, {})).to.be.null;
      });
    });

    describe('HEAP_SPACE point type', () => {
      const mapping = {
        pointType: POINT_TYPES.HEAP_SPACE,
        instana: 'heapSpaces',
        field: 'available',
        attributeKey: 'v8js.heap.space.name'
      };

      it('emits one data point per space that has the target field', () => {
        const result = resolveDataPoints(mapping, {
          heapSpaces: {
            new_space: { available: 100 },
            old_space: { available: 200 }
          }
        });
        expect(result).to.deep.equal([
          { attributes: { 'v8js.heap.space.name': 'new_space' }, value: 100 },
          { attributes: { 'v8js.heap.space.name': 'old_space' }, value: 200 }
        ]);
      });

      it('skips spaces that are missing the target field', () => {
        const result = resolveDataPoints(mapping, {
          heapSpaces: { new_space: { used: 100 } }
        });
        expect(result).to.be.null;
      });

      it('returns null when heapSpaces is missing entirely', () => {
        expect(resolveDataPoints(mapping, {})).to.be.null;
      });
    });
  });

  describe('extractMappedMetrics', () => {
    const gaugeMapping = {
      name: 'test.gauge',
      unit: '{item}',
      type: METRIC_TYPES.GAUGE,
      pointType: POINT_TYPES.SINGLE,
      instana: 'count',
      attributes: {}
    };

    const histogramMapping = {
      name: 'test.histogram',
      unit: 's',
      type: METRIC_TYPES.HISTOGRAM,
      pointType: POINT_TYPES.HISTOGRAM,
      instana: 'duration',
      attributes: {},
      transform: v => v / 1000
    };

    it('returns an empty array for a null payload', () => {
      expect(extractMappedMetrics(null, { metricMappings: [gaugeMapping] })).to.deep.equal([]);
    });

    it('returns an empty array when metricMappings is not an array', () => {
      expect(extractMappedMetrics({ count: 1 }, {})).to.deep.equal([]);
      expect(extractMappedMetrics({ count: 1 }, { metricMappings: null })).to.deep.equal([]);
    });

    it('silently skips a mapping whose instana path is absent from the payload', () => {
      const result = extractMappedMetrics({ timestamp: TIME_MS }, { metricMappings: [gaugeMapping] });
      expect(result).to.deep.equal([]);
    });

    it('produces a complete gauge metric object', () => {
      const result = extractMappedMetrics({ timestamp: TIME_MS, count: 7 }, { metricMappings: [gaugeMapping] });
      expect(result).to.have.length(1);
      expect(result[0].name).to.equal('test.gauge');
      expect(result[0].unit).to.equal('{item}');
      expect(result[0].gauge.dataPoints[0].asInt).to.equal(7);
      expect(result[0].gauge.dataPoints[0].timeUnixNano).to.equal(TIME_NANO);
    });

    it('produces a complete histogram metric with the correct OTLP data point shape', () => {
      const result = extractMappedMetrics(
        { timestamp: TIME_MS, duration: 414 },
        { metricMappings: [histogramMapping] }
      );
      expect(result).to.have.length(1);
      const dp = result[0].histogram.dataPoints[0];
      expect(dp.sum).to.equal(0.414);
      expect(dp.count).to.equal(1);
      expect(dp.bucketCounts).to.deep.equal([1]);
      expect(dp.explicitBounds).to.deep.equal([]);
    });

    it('uses Date.now() when timestamp is absent', () => {
      const before = Date.now() * 1e6;
      const result = extractMappedMetrics({ count: 1 }, { metricMappings: [gaugeMapping] });
      const after = Date.now() * 1e6;
      const nano = Number(result[0].gauge.dataPoints[0].timeUnixNano);
      expect(nano).to.be.at.least(before);
      expect(nano).to.be.at.most(after);
    });

    it('processes multiple mappings and returns one metric per resolved mapping', () => {
      const result = extractMappedMetrics(
        { timestamp: TIME_MS, count: 5, duration: 200 },
        { metricMappings: [gaugeMapping, histogramMapping] }
      );
      expect(result).to.have.length(2);
      expect(result[0].name).to.equal('test.gauge');
      expect(result[1].name).to.equal('test.histogram');
    });
  });
});
