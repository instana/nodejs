/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const expect = require('chai').expect;

const { extractMetrics } = require('../../../../src/otlpExporter/metrics/transformers/runtimeMetrics');
const mapper = require('../../../../src/otlpExporter/metrics/mappers/runtimeMetricsMappings');

const FULL_PAYLOAD = {
  gc: { gcPause: 414 },
  heapSpaces: {
    new_space: { available: 5972864, used: 10622592, physical: 27901952, current: 6291456 },
    old_space: { available: 25165824, used: 16309064, physical: 17039360, current: 16859136 }
  },
  activeResources: { count: 18 },
  libuv: { min: 0, max: 582, sum: 4820, num: 42 },
  timestamp: 1544712660300
};

describe('otlpExporter/metrics/transformers/runtimeMetrics', () => {
  describe('extractMetrics', () => {
    it('produces all 9 metrics from a full payload', () => {
      const result = extractMetrics(FULL_PAYLOAD, mapper);
      const names = result.map(m => m.name);
      expect(names).to.deep.equal([
        'v8js.gc.duration',
        'v8js.memory.heap.space.available_size',
        'v8js.memory.heap.space.physical_size',
        'v8js.memory.heap.space.size',
        'v8js.memory.heap.used',
        'v8js.resource.active',
        'nodejs.eventloop.delay.min',
        'nodejs.eventloop.delay.max',
        'nodejs.eventloop.delay.mean'
      ]);
    });

    it('each metric has name, unit and the correct OTLP type envelope', () => {
      const result = extractMetrics(FULL_PAYLOAD, mapper);
      result.forEach(m => {
        expect(m).to.have.property('name').that.is.a('string');
        expect(m).to.have.property('unit').that.is.a('string');
        const hasEnvelope = 'gauge' in m || 'sum' in m || 'histogram' in m;
        expect(hasEnvelope).to.equal(true);
      });
    });

    it('returns an empty array for an empty payload', () => {
      expect(extractMetrics({}, mapper)).to.deep.equal([]);
    });

    it('returns an empty array for null payload', () => {
      expect(extractMetrics(null, mapper)).to.deep.equal([]);
    });

    it('returns an empty array for null mapper', () => {
      expect(extractMetrics(FULL_PAYLOAD, null)).to.deep.equal([]);
    });

    it('only emits metrics whose source fields are present', () => {
      const result = extractMetrics({ libuv: { min: 10, max: 200, sum: 500, num: 5 } }, mapper);
      const names = result.map(m => m.name);
      expect(names).to.deep.equal([
        'nodejs.eventloop.delay.min',
        'nodejs.eventloop.delay.max',
        'nodejs.eventloop.delay.mean'
      ]);
    });

    it('gc.duration uses histogram envelope with count and sum', () => {
      const result = extractMetrics({ gc: { gcPause: 1000 } }, mapper);
      const gcMetric = result.find(m => m.name === 'v8js.gc.duration');
      expect(gcMetric).to.have.property('histogram');
      expect(gcMetric.histogram).to.have.property('dataPoints').with.length(1);
      expect(gcMetric.histogram.dataPoints[0]).to.include({ count: '1', sum: 1 });
    });

    it('gauge metrics use gauge envelope', () => {
      const result = extractMetrics({ activeResources: { count: 18 } }, mapper);
      const metric = result.find(m => m.name === 'v8js.resource.active');
      expect(metric).to.have.property('gauge');
      expect(metric.gauge.dataPoints[0]).to.have.property('asInt', 18);
    });

    it('updowncounter metrics use sum envelope with isMonotonic false', () => {
      const result = extractMetrics(FULL_PAYLOAD, mapper);
      const metric = result.find(m => m.name === 'v8js.memory.heap.space.available_size');
      expect(metric).to.have.property('sum');
      expect(metric.sum.isMonotonic).to.equal(false);
      expect(metric.sum.aggregationTemporality).to.equal(2);
    });

    it('data-points have timeUnixNano derived from payload timestamp', () => {
      const result = extractMetrics({ activeResources: { count: 5 }, timestamp: 1544712660300 }, mapper);
      const metric = result.find(m => m.name === 'v8js.resource.active');
      expect(metric.gauge.dataPoints[0].timeUnixNano).to.equal(String(1544712660300 * 1e6));
    });

    it('data-point attributes are formatted as OTLP key-value array', () => {
      const result = extractMetrics({ activeResources: { count: 5 } }, mapper);
      const metric = result.find(m => m.name === 'v8js.resource.active');
      const attrs = metric.gauge.dataPoints[0].attributes;
      expect(attrs).to.be.an('array').with.length(1);
      expect(attrs[0]).to.deep.include({ key: 'v8js.resource.type' });
      expect(attrs[0].value).to.deep.equal({ stringValue: 'all' });
    });
  });
});
