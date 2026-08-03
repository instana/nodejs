/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const expect = require('chai').expect;

const { extractMetrics } = require('../../../../src/otlpExporter/metrics/transformers/runtimeMetrics');
const mapper = require('../../../../src/otlpExporter/metrics/mappers/runtimeMetrics');

const FULL_PAYLOAD = {
  gc: { gcPause: 414 },
  heapSpaces: {
    new_space: { available: 5972864, used: 10622592, physical: 27901952, current: 6291456 },
    old_space: { available: 25165824, used: 16309064, physical: 17039360, current: 16859136 }
  },
  activeResources: { count: 18 },
  libuv: { min: 0, max: 582, sum: 4820, num: 42 }
};

describe('otlpExporter/metrics/transformers/runtimeMetrics', () => {
  describe('extractMetrics', () => {
    it('produces all 9 metrics from a full payload', () => {
      const result = extractMetrics(FULL_PAYLOAD, mapper);
      const names = result.map(m => m.descriptor.name);
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

    it('each metric has descriptor, type and dataPoints', () => {
      const result = extractMetrics(FULL_PAYLOAD, mapper);
      for (const m of result) {
        expect(m).to.have.property('descriptor').that.has.keys(['name', 'unit']);
        expect(m).to.have.property('type').that.is.a('string');
        expect(m).to.have.property('dataPoints').that.is.an('array').with.length.greaterThan(0);
      }
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
      const names = result.map(m => m.descriptor.name);
      expect(names).to.deep.equal([
        'nodejs.eventloop.delay.min',
        'nodejs.eventloop.delay.max',
        'nodejs.eventloop.delay.mean'
      ]);
    });

    it('gc.duration has histogram type with count and sum in value', () => {
      const result = extractMetrics({ gc: { gcPause: 1000 } }, mapper);
      const gcMetric = result.find(m => m.descriptor.name === 'v8js.gc.duration');
      expect(gcMetric.type).to.equal('histogram');
      expect(gcMetric.dataPoints[0].value).to.deep.equal({ count: 1, sum: 1 });
    });
  });
});
