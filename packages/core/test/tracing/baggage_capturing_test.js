/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { expect } = require('chai');
const proxyquire = require('proxyquire');
const { createFakeLogger } = require('../test_util');
const coreConfig = require('../../src/config');

describe('baggage capturing', () => {
  before(() => {
    coreConfig.init(createFakeLogger());
  });

  beforeEach(() => {
    delete process.env.INSTANA_TRACING_CAPTURE_W3C_BAGGAGE;
    delete process.env.INSTANA_TRACING_DISABLE_W3C_BAGGAGE;
  });

  afterEach(() => {
    delete process.env.INSTANA_TRACING_CAPTURE_W3C_BAGGAGE;
    delete process.env.INSTANA_TRACING_DISABLE_W3C_BAGGAGE;
  });

  describe('config normalization – captureW3cBaggage', () => {
    it('defaults to empty array', () => {
      const config = coreConfig.normalize();
      expect(config.tracing.captureW3cBaggage).to.deep.equal([]);
    });

    it('reads comma-separated keys from INSTANA_TRACING_CAPTURE_W3C_BAGGAGE', () => {
      process.env.INSTANA_TRACING_CAPTURE_W3C_BAGGAGE = 'userId,isPremium';
      const config = coreConfig.normalize();
      expect(config.tracing.captureW3cBaggage).to.deep.equal(['userId', 'isPremium']);
    });

    it('trims whitespace around keys', () => {
      process.env.INSTANA_TRACING_CAPTURE_W3C_BAGGAGE = ' userId , isPremium ';
      const config = coreConfig.normalize();
      expect(config.tracing.captureW3cBaggage).to.deep.equal(['userId', 'isPremium']);
    });

    it('filters empty entries', () => {
      process.env.INSTANA_TRACING_CAPTURE_W3C_BAGGAGE = 'userId,,isPremium,';
      const config = coreConfig.normalize();
      expect(config.tracing.captureW3cBaggage).to.deep.equal(['userId', 'isPremium']);
    });

    it('accepts in-code array', () => {
      const config = coreConfig.normalize({ userConfig: { tracing: { captureW3cBaggage: ['userId'] } } });
      expect(config.tracing.captureW3cBaggage).to.deep.equal(['userId']);
    });

    it('env var takes precedence over in-code value', () => {
      process.env.INSTANA_TRACING_CAPTURE_W3C_BAGGAGE = 'fromEnv';
      const config = coreConfig.normalize({ userConfig: { tracing: { captureW3cBaggage: ['fromCode'] } } });
      expect(config.tracing.captureW3cBaggage).to.deep.equal(['fromEnv']);
    });
  });

  describe('parseBaggageHeader', () => {
    let baggage;

    before(() => {
      baggage = require('../../src/tracing/baggage');
    });

    it('parses key=value pairs', () => {
      expect(baggage.parseBaggageHeader('userId=alice,isPremium=true')).to.deep.equal({
        userId: 'alice',
        isPremium: 'true'
      });
    });

    it('percent-decodes values per RFC 3986', () => {
      expect(baggage.parseBaggageHeader('userId=alice%20smith')).to.deep.equal({ userId: 'alice smith' });
    });

    it('ignores properties (semicolon-separated metadata)', () => {
      expect(baggage.parseBaggageHeader('userId=alice;prop1;prop2=v,isPremium=true')).to.deep.equal({
        userId: 'alice',
        isPremium: 'true'
      });
    });

    it('returns empty object for empty string', () => {
      expect(baggage.parseBaggageHeader('')).to.deep.equal({});
    });

    it('returns empty object for null', () => {
      expect(baggage.parseBaggageHeader(null)).to.deep.equal({});
    });

    it('skips malformed entries without = sign', () => {
      expect(baggage.parseBaggageHeader('novalue,key=val')).to.deep.equal({ key: 'val' });
    });
  });

  describe('renderBaggageHeader', () => {
    let baggage;

    before(() => {
      baggage = require('../../src/tracing/baggage');
    });

    it('renders key=value pairs', () => {
      expect(baggage.renderBaggageHeader({ userId: 'alice', isPremium: 'true' })).to.equal(
        'userId=alice,isPremium=true'
      );
    });

    it('percent-encodes values', () => {
      expect(baggage.renderBaggageHeader({ userId: 'alice smith' })).to.equal('userId=alice%20smith');
    });

    it('returns empty string for empty object', () => {
      expect(baggage.renderBaggageHeader({})).to.equal('');
    });
  });

  describe('applyCaptureTags', () => {
    let baggage;

    before(() => {
      baggage = require('../../src/tracing/baggage');
    });

    it('captures only configured keys', () => {
      const tags = {};
      baggage.applyCaptureTags('userId=alice,isPremium=true,region=eu', ['userId'], tags);
      expect(tags).to.deep.equal({ userId: 'alice' });
    });

    it('does not capture keys not in the capture list', () => {
      const tags = {};
      baggage.applyCaptureTags('userId=alice,region=eu', ['userId'], tags);
      expect(tags).to.not.have.property('region');
    });

    it('does not overwrite existing tag (existing annotation wins)', () => {
      const tags = { userId: 'existing' };
      baggage.applyCaptureTags('userId=fromBaggage', ['userId'], tags);
      expect(tags.userId).to.equal('existing');
    });

    it('does nothing when captureKeys is empty', () => {
      const tags = {};
      baggage.applyCaptureTags('userId=alice', [], tags);
      expect(tags).to.deep.equal({});
    });

    it('does nothing when rawBaggage is null', () => {
      const tags = {};
      baggage.applyCaptureTags(null, ['userId'], tags);
      expect(tags).to.deep.equal({});
    });

    it('does not capture properties', () => {
      const tags = {};
      baggage.applyCaptureTags('userId=alice;prop1=v', ['userId'], tags);
      expect(tags).to.deep.equal({ userId: 'alice' });
      expect(tags).to.not.have.property('prop1');
    });
  });

  describe('cls.startSpan – baggage capturing on all spans', () => {
    let cls;

    beforeEach(() => {
      cls = proxyquire('../../src/tracing/cls', {});
      cls.init({
        logger: createFakeLogger(),
        tracing: { captureW3cBaggage: ['userId', 'isPremium'] }
      });
    });

    it('captures configured keys on entry span', () => {
      cls.ns.run(() => {
        cls.setBaggage('userId=alice%20smith,isPremium=true,region=eu');
        const span = cls.startSpan({ spanName: 'node.http.server', kind: 1, spanData: {} });
        expect(span.data.sdk.custom.tags.userId).to.equal('alice smith');
        expect(span.data.sdk.custom.tags.isPremium).to.equal('true');
        expect(span.data.sdk.custom.tags).to.not.have.property('region');
      });
    });

    it('captures configured keys on child (exit) spans', () => {
      cls.ns.run(() => {
        cls.setBaggage('userId=bob,isPremium=false');
        const entry = cls.startSpan({ spanName: 'node.http.server', kind: 1, spanData: {} });
        const exit = cls.startSpan({ spanName: 'node.http.client', kind: 2, spanData: {} });
        expect(exit.data.sdk.custom.tags.userId).to.equal('bob');
        entry.cancel();
        exit.cancel();
      });
    });

    it('existing annotation wins over baggage value', () => {
      cls.ns.run(() => {
        cls.setBaggage('userId=fromBaggage');
        const span = cls.startSpan({ spanName: 'node.http.server', kind: 1, spanData: { sdk: { custom: { tags: { userId: 'existing' } } } } });
        expect(span.data.sdk.custom.tags.userId).to.equal('existing');
      });
    });

    it('does not capture when captureW3cBaggage is empty', () => {
      const clsEmpty = proxyquire('../../src/tracing/cls', {});
      clsEmpty.init({ logger: createFakeLogger(), tracing: { captureW3cBaggage: [] } });
      clsEmpty.ns.run(() => {
        clsEmpty.setBaggage('userId=alice');
        const span = clsEmpty.startSpan({ spanName: 'sdk', kind: 1, spanData: {} });
        expect(span.data.sdk).to.be.undefined;
      });
    });

    it('does not capture when no baggage in CLS', () => {
      cls.ns.run(() => {
        const span = cls.startSpan({ spanName: 'sdk', kind: 1, spanData: {} });
        expect(span.data.sdk).to.be.undefined;
      });
    });
  });

  describe('sdk.setBaggage', () => {
    let sdk;
    let cls;

    beforeEach(() => {
      cls = proxyquire('../../src/tracing/cls', {});
      cls.init({ logger: createFakeLogger() });

      const sdkModule = require('../../src/tracing/sdk/sdk');
      const generated = sdkModule.generate(false);
      generated.init({ logger: createFakeLogger() }, cls);
      generated.activate();
      sdk = generated;
    });

    it('sets a new key in the baggage header stored in CLS', () => {
      cls.ns.run(() => {
        cls.setBaggage('existingKey=existingVal');
        sdk.setBaggage('newKey', 'newVal');
        expect(cls.getBaggage()).to.include('newKey=newVal');
      });
    });

    it('overrides an existing key', () => {
      cls.ns.run(() => {
        cls.setBaggage('userId=oldVal');
        sdk.setBaggage('userId', 'newVal');
        const raw = cls.getBaggage();
        const parsed = require('../../src/tracing/baggage').parseBaggageHeader(raw);
        expect(parsed.userId).to.equal('newVal');
      });
    });

    it('creates baggage from scratch when none exists', () => {
      cls.ns.run(() => {
        sdk.setBaggage('key', 'value');
        expect(cls.getBaggage()).to.equal('key=value');
      });
    });

    it('percent-encodes special characters in the value', () => {
      cls.ns.run(() => {
        sdk.setBaggage('user', 'alice smith');
        expect(cls.getBaggage()).to.include('user=alice%20smith');
      });
    });
  });

  describe('OTLP export – baggage in sdk.custom.tags flows into attributes', () => {
    let mapper;

    before(() => {
      mapper = require('../../src/otlpExporter/traces/mappers/instanaInstrumentationMappings');
    });

    it('includes sdk.custom.tags entries as OTLP attributes', () => {
      const span = {
        n: 'sdk',
        k: 1,
        data: {
          sdk: {
            name: 'test',
            type: 'entry',
            custom: {
              tags: { userId: 'alice', isPremium: 'true' }
            }
          }
        }
      };

      const attributes = mapper.spanAttributes(span);
      const keys = attributes.map(a => a.key);
      expect(keys).to.include('userId');
      expect(keys).to.include('isPremium');

      const userAttr = attributes.find(a => a.key === 'userId');
      expect(userAttr.value).to.deep.equal({ stringValue: 'alice' });
    });
  });
});
