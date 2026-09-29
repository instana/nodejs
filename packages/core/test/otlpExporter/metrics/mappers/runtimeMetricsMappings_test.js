/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const expect = require('chai').expect;

const { MAPPINGS } = require('../../../../src/otlpExporter/common/semconv/base/mappings');
const V8 = MAPPINGS.metrics.v8js;
const NODEJS = MAPPINGS.metrics.nodejs;

const mapper = require('../../../../src/otlpExporter/metrics/mappers/runtimeMetricsMappings');
const { resolvePath, msToSeconds, computeMean } = require('../../../../src/otlpExporter/metrics/mappers/util');
const { resolveDataPoints } = require('../../../../src/otlpExporter/metrics/transformers/util');

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

    it('every mapping declares pointType, name, unit, type and instana', () => {
      mapper.metricMappings.forEach(m => {
        expect(m).to.have.property('pointType').that.is.a('string');
        expect(m).to.have.property('name').that.is.a('string');
        expect(m).to.have.property('unit').that.is.a('string');
        expect(m).to.have.property('type').that.is.a('string');
        expect(m).to.have.property('instana').that.is.a('string');
      });
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
      expect(mapping.pointType).to.equal('histogram');
    });

    it('declares instana path gc.gcPause', () => {
      expect(mapping.instana).to.equal('gc.gcPause');
    });

    it('declares gc.type = "all" attribute', () => {
      expect(mapping.attributes).to.deep.include({ [V8.attributes.GC_TYPE]: 'all' });
    });

    it('transform converts ms → seconds', () => {
      expect(mapping.transform(414)).to.equal(0.414);
    });

    it('resolves to a histogram data point from a full payload', () => {
      const points = resolveDataPoints(mapping, { gc: { gcPause: 414 } });
      expect(points).to.deep.equal([
        { attributes: { [V8.attributes.GC_TYPE]: 'all' }, value: { count: 1, sum: 0.414 } }
      ]);
    });

    it('returns null when gc is missing', () => {
      expect(resolveDataPoints(mapping, {})).to.be.null;
    });

    it('returns null when gcPause is not a number', () => {
      expect(resolveDataPoints(mapping, { gc: { gcPause: null } })).to.be.null;
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
      expect(mapping.pointType).to.equal('heapSpace');
    });

    it('declares field = "available" and correct attributeKey', () => {
      expect(mapping.field).to.equal('available');
      expect(mapping.attributeKey).to.equal(V8.attributes.HEAP_SPACE_NAME);
    });

    it('emits one data-point per space that has available', () => {
      const points = resolveDataPoints(mapping, FULL_PAYLOAD);
      expect(points).to.deep.equal([
        { attributes: { [V8.attributes.HEAP_SPACE_NAME]: 'new_space' }, value: 5972864 },
        { attributes: { [V8.attributes.HEAP_SPACE_NAME]: 'old_space' }, value: 25165824 }
      ]);
    });

    it('returns null when heapSpaces is missing', () => {
      expect(resolveDataPoints(mapping, {})).to.be.null;
    });

    it('returns null when no space has available', () => {
      expect(resolveDataPoints(mapping, { heapSpaces: { x: { current: 1 } } })).to.be.null;
    });
  });

  describe('v8js.memory.heap.space.physical_size', () => {
    let mapping;
    before(() => {
      mapping = findMapping(V8.HEAP_SPACE_PHYSICAL_SIZE);
    });

    it('declares field = "physical"', () => {
      expect(mapping.field).to.equal('physical');
    });

    it('emits one data-point per space that has physical', () => {
      const points = resolveDataPoints(mapping, FULL_PAYLOAD);
      expect(points).to.deep.equal([
        { attributes: { [V8.attributes.HEAP_SPACE_NAME]: 'new_space' }, value: 27901952 },
        { attributes: { [V8.attributes.HEAP_SPACE_NAME]: 'old_space' }, value: 17039360 }
      ]);
    });

    it('returns null when heapSpaces is missing', () => {
      expect(resolveDataPoints(mapping, {})).to.be.null;
    });
  });

  describe('v8js.memory.heap.space.size', () => {
    let mapping;
    before(() => {
      mapping = findMapping(V8.HEAP_SPACE_SIZE);
    });

    it('declares field = "current"', () => {
      expect(mapping.field).to.equal('current');
    });

    it('emits one data-point per space that has current', () => {
      const points = resolveDataPoints(mapping, FULL_PAYLOAD);
      expect(points).to.deep.equal([
        { attributes: { [V8.attributes.HEAP_SPACE_NAME]: 'new_space' }, value: 6291456 },
        { attributes: { [V8.attributes.HEAP_SPACE_NAME]: 'old_space' }, value: 16859136 }
      ]);
    });

    it('returns null when heapSpaces is missing', () => {
      expect(resolveDataPoints(mapping, {})).to.be.null;
    });
  });

  describe('v8js.memory.heap.used', () => {
    let mapping;
    before(() => {
      mapping = findMapping(V8.HEAP_USED);
    });

    it('declares field = "used"', () => {
      expect(mapping.field).to.equal('used');
    });

    it('emits one data-point per space that has used', () => {
      const points = resolveDataPoints(mapping, FULL_PAYLOAD);
      expect(points).to.deep.equal([
        { attributes: { [V8.attributes.HEAP_SPACE_NAME]: 'new_space' }, value: 10622592 },
        { attributes: { [V8.attributes.HEAP_SPACE_NAME]: 'old_space' }, value: 16309064 }
      ]);
    });

    it('returns null when heapSpaces is missing', () => {
      expect(resolveDataPoints(mapping, {})).to.be.null;
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
      expect(mapping.pointType).to.equal('single');
    });

    it('declares instana path activeResources.count', () => {
      expect(mapping.instana).to.equal('activeResources.count');
    });

    it('declares resource.type = "all" attribute', () => {
      expect(mapping.attributes).to.deep.include({ [V8.attributes.RESOURCE_TYPE]: 'all' });
    });

    it('maps activeResources.count with resource.type = "all"', () => {
      const points = resolveDataPoints(mapping, { activeResources: { count: 18 } });
      expect(points).to.deep.equal([{ attributes: { [V8.attributes.RESOURCE_TYPE]: 'all' }, value: 18 }]);
    });

    it('returns null when activeResources is missing', () => {
      expect(resolveDataPoints(mapping, {})).to.be.null;
    });

    it('returns null when count is not a number', () => {
      expect(resolveDataPoints(mapping, { activeResources: { count: null } })).to.be.null;
    });
  });

  describe('nodejs.eventloop.delay.min', () => {
    let mapping;
    before(() => {
      mapping = findMapping(NODEJS.EVENTLOOP_DELAY_MIN);
    });

    it('declares instana path libuv.min and transform = msToSeconds', () => {
      expect(mapping.instana).to.equal('libuv.min');
      expect(mapping.transform).to.equal(msToSeconds);
    });

    it('converts libuv.min ms → seconds', () => {
      const points = resolveDataPoints(mapping, { libuv: { min: 0 } });
      expect(points).to.deep.equal([{ attributes: {}, value: 0 }]);
    });

    it('converts non-zero min', () => {
      const points = resolveDataPoints(mapping, { libuv: { min: 5000 } });
      expect(points[0].value).to.equal(5);
    });

    it('returns null when libuv is missing', () => {
      expect(resolveDataPoints(mapping, {})).to.be.null;
    });

    it('returns null when min is not a number', () => {
      expect(resolveDataPoints(mapping, { libuv: { min: null } })).to.be.null;
    });
  });

  describe('nodejs.eventloop.delay.max', () => {
    let mapping;
    before(() => {
      mapping = findMapping(NODEJS.EVENTLOOP_DELAY_MAX);
    });

    it('declares instana path libuv.max and transform = msToSeconds', () => {
      expect(mapping.instana).to.equal('libuv.max');
      expect(mapping.transform).to.equal(msToSeconds);
    });

    it('converts libuv.max ms → seconds', () => {
      const points = resolveDataPoints(mapping, { libuv: { max: 582 } });
      expect(points).to.deep.equal([{ attributes: {}, value: 0.582 }]);
    });

    it('returns null when max is absent', () => {
      expect(resolveDataPoints(mapping, { libuv: {} })).to.be.null;
    });
  });

  describe('nodejs.eventloop.delay.mean', () => {
    let mapping;
    before(() => {
      mapping = findMapping(NODEJS.EVENTLOOP_DELAY_MEAN);
    });

    it('declares instana path libuv and transform = computeMean', () => {
      expect(mapping.instana).to.equal('libuv');
      expect(mapping.transform).to.equal(computeMean);
    });

    it('derives mean from sum / num and converts ms → seconds', () => {
      const points = resolveDataPoints(mapping, { libuv: { sum: 4200, num: 42 } });
      expect(points).to.deep.equal([{ attributes: {}, value: 0.1 }]);
    });

    it('returns null when num is 0 (avoids division by zero)', () => {
      expect(resolveDataPoints(mapping, { libuv: { sum: 100, num: 0 } })).to.be.null;
    });

    it('returns null when sum or num is missing', () => {
      expect(resolveDataPoints(mapping, { libuv: { sum: 100 } })).to.be.null;
      expect(resolveDataPoints(mapping, { libuv: { num: 5 } })).to.be.null;
    });
  });

  describe('mappers/util helpers', () => {
    describe('resolvePath', () => {
      it('resolves a nested dot path', () => {
        expect(resolvePath({ a: { b: 42 } }, 'a.b')).to.equal(42);
      });

      it('returns undefined for missing segments', () => {
        expect(resolvePath({}, 'a.b')).to.be.undefined;
      });

      it('returns undefined when an intermediate segment is null', () => {
        expect(resolvePath({ a: null }, 'a.b')).to.be.undefined;
      });
    });

    describe('computeMean', () => {
      it('returns mean in seconds', () => {
        expect(computeMean({ sum: 4200, num: 42 })).to.equal(0.1);
      });

      it('returns undefined when num is 0', () => {
        expect(computeMean({ sum: 100, num: 0 })).to.be.undefined;
      });

      it('returns undefined when libuv is null', () => {
        expect(computeMean(null)).to.be.undefined;
      });
    });
  });
});
