/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const expect = require('chai').expect;

const { MAPPINGS } = require('../../../../src/otlpExporter/common/semconv/base/mappings');
const V8 = MAPPINGS.metrics.v8js;
const NODEJS = MAPPINGS.metrics.nodejs;

const mapper = require('../../../../src/otlpExporter/metrics/mappers/runtimeMetricsMappings');

const FULL_PAYLOAD = {
  gc: { gcPause: 414 },
  heapSpaces: {
    new_space: { available: 5972864, used: 10622592, physical: 27901952, current: 6291456 },
    old_space: { available: 25165824, used: 16309064, physical: 17039360, current: 16859136 }
  },
  activeResources: { count: 18 },
  libuv: { min: 0, max: 582, sum: 4820, num: 42 }
};

/**
 * @param {string} name
 */
function findMapping(name) {
  return mapper.metricMappings.find(m => m.name === name);
}

describe('otlpExporter/metrics/mappers/runtimeMetrics', () => {
  describe('metricMappings', () => {
    it('exports 9 mapping entries', () => {
      expect(mapper.metricMappings).to.have.length(9);
    });
  });

  describe('v8js.gc.duration', () => {
    let mapping;
    before(() => {
      mapping = findMapping(V8.GC_DURATION);
    });

    it('has correct descriptor metadata', () => {
      expect(mapping.unit).to.equal('s');
      expect(mapping.type).to.equal('histogram');
    });

    it('converts gcPause ms → seconds as Histogram sum', () => {
      const points = mapping.dataPoints({ gc: { gcPause: 414 } });
      expect(points).to.deep.equal([
        { attributes: { [V8.attributes.GC_TYPE]: 'all' }, value: { count: 1, sum: 0.414 } }
      ]);
    });

    it('returns null when gc is missing', () => {
      expect(mapping.dataPoints({})).to.be.null;
    });

    it('returns null when gcPause is not a number', () => {
      expect(mapping.dataPoints({ gc: { gcPause: null } })).to.be.null;
    });
  });

  describe('v8js.memory.heap.space.available_size', () => {
    let mapping;
    before(() => {
      mapping = findMapping(V8.HEAP_SPACE_AVAILABLE_SIZE);
    });

    it('has correct descriptor metadata', () => {
      expect(mapping.unit).to.equal('By');
      expect(mapping.type).to.equal('updowncounter');
    });

    it('emits one data-point per space that has available', () => {
      const points = mapping.dataPoints(FULL_PAYLOAD);
      expect(points).to.deep.equal([
        { attributes: { [V8.attributes.HEAP_SPACE_NAME]: 'new_space' }, value: 5972864 },
        { attributes: { [V8.attributes.HEAP_SPACE_NAME]: 'old_space' }, value: 25165824 }
      ]);
    });

    it('returns null when heapSpaces is missing', () => {
      expect(mapping.dataPoints({})).to.be.null;
    });

    it('returns null when no space has available', () => {
      expect(mapping.dataPoints({ heapSpaces: { x: { current: 1 } } })).to.be.null;
    });
  });

  describe('v8js.memory.heap.space.physical_size', () => {
    let mapping;
    before(() => {
      mapping = findMapping(V8.HEAP_SPACE_PHYSICAL_SIZE);
    });

    it('emits one data-point per space that has physical', () => {
      const points = mapping.dataPoints(FULL_PAYLOAD);
      expect(points).to.deep.equal([
        { attributes: { [V8.attributes.HEAP_SPACE_NAME]: 'new_space' }, value: 27901952 },
        { attributes: { [V8.attributes.HEAP_SPACE_NAME]: 'old_space' }, value: 17039360 }
      ]);
    });

    it('returns null when heapSpaces is missing', () => {
      expect(mapping.dataPoints({})).to.be.null;
    });
  });

  describe('v8js.memory.heap.space.size', () => {
    let mapping;
    before(() => {
      mapping = findMapping(V8.HEAP_SPACE_SIZE);
    });

    it('emits one data-point per space that has current', () => {
      const points = mapping.dataPoints(FULL_PAYLOAD);
      expect(points).to.deep.equal([
        { attributes: { [V8.attributes.HEAP_SPACE_NAME]: 'new_space' }, value: 6291456 },
        { attributes: { [V8.attributes.HEAP_SPACE_NAME]: 'old_space' }, value: 16859136 }
      ]);
    });

    it('returns null when heapSpaces is missing', () => {
      expect(mapping.dataPoints({})).to.be.null;
    });
  });

  describe('v8js.memory.heap.used', () => {
    let mapping;
    before(() => {
      mapping = findMapping(V8.HEAP_USED);
    });

    it('emits one data-point per space that has used', () => {
      const points = mapping.dataPoints(FULL_PAYLOAD);
      expect(points).to.deep.equal([
        { attributes: { [V8.attributes.HEAP_SPACE_NAME]: 'new_space' }, value: 10622592 },
        { attributes: { [V8.attributes.HEAP_SPACE_NAME]: 'old_space' }, value: 16309064 }
      ]);
    });

    it('returns null when heapSpaces is missing', () => {
      expect(mapping.dataPoints({})).to.be.null;
    });
  });

  describe('v8js.resource.active', () => {
    let mapping;
    before(() => {
      mapping = findMapping(V8.RESOURCE_ACTIVE);
    });

    it('has correct descriptor metadata', () => {
      expect(mapping.unit).to.equal('{resource}');
      expect(mapping.type).to.equal('gauge');
    });

    it('maps activeResources.count with resource.type = "all"', () => {
      const points = mapping.dataPoints({ activeResources: { count: 18 } });
      expect(points).to.deep.equal([{ attributes: { [V8.attributes.RESOURCE_TYPE]: 'all' }, value: 18 }]);
    });

    it('returns null when activeResources is missing', () => {
      expect(mapping.dataPoints({})).to.be.null;
    });

    it('returns null when count is not a number', () => {
      expect(mapping.dataPoints({ activeResources: { count: null } })).to.be.null;
    });
  });

  describe('nodejs.eventloop.delay.min', () => {
    let mapping;
    before(() => {
      mapping = findMapping(NODEJS.EVENTLOOP_DELAY_MIN);
    });

    it('converts libuv.min ms → seconds', () => {
      const points = mapping.dataPoints({ libuv: { min: 0 } });
      expect(points).to.deep.equal([{ attributes: {}, value: 0 }]);
    });

    it('converts non-zero min', () => {
      const points = mapping.dataPoints({ libuv: { min: 5000 } });
      expect(points[0].value).to.equal(5);
    });

    it('returns null when libuv is missing', () => {
      expect(mapping.dataPoints({})).to.be.null;
    });

    it('returns null when min is not a number', () => {
      expect(mapping.dataPoints({ libuv: { min: null } })).to.be.null;
    });
  });

  describe('nodejs.eventloop.delay.max', () => {
    let mapping;
    before(() => {
      mapping = findMapping(NODEJS.EVENTLOOP_DELAY_MAX);
    });

    it('converts libuv.max ms → seconds', () => {
      const points = mapping.dataPoints({ libuv: { max: 582 } });
      expect(points).to.deep.equal([{ attributes: {}, value: 0.582 }]);
    });

    it('returns null when max is absent', () => {
      expect(mapping.dataPoints({ libuv: {} })).to.be.null;
    });
  });

  describe('nodejs.eventloop.delay.mean', () => {
    let mapping;
    before(() => {
      mapping = findMapping(NODEJS.EVENTLOOP_DELAY_MEAN);
    });

    it('derives mean from sum / num and converts ms → seconds', () => {
      const points = mapping.dataPoints({ libuv: { sum: 4200, num: 42 } });
      expect(points).to.deep.equal([{ attributes: {}, value: 0.1 }]);
    });

    it('returns null when num is 0 (avoids division by zero)', () => {
      expect(mapping.dataPoints({ libuv: { sum: 100, num: 0 } })).to.be.null;
    });

    it('returns null when sum or num is missing', () => {
      expect(mapping.dataPoints({ libuv: { sum: 100 } })).to.be.null;
      expect(mapping.dataPoints({ libuv: { num: 5 } })).to.be.null;
    });
  });
});
