/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const expect = require('chai').expect;

describe('tracing/instrumentationRegistry', () => {
  let registry;

  afterEach(() => {
    delete require.cache[require.resolve('../../src/tracing/instrumentationRegistry')];
  });

  beforeEach(() => {
    registry = require('../../src/tracing/instrumentationRegistry');
  });

  it('should include expected span types in messaging group', () => {
    const messaging = registry.getSpanTypesForGroup('messaging');

    expect(messaging).to.be.an('array');
    expect(messaging).to.include.members(['kafka', 'nats']);
  });

  it('should include expected span types in databases group', () => {
    const databases = registry.getSpanTypesForGroup('databases');

    expect(databases).to.be.an('array');
    expect(databases).to.include('mongo');
  });

  it('should include expected span types in protocols group', () => {
    const protocols = registry.getSpanTypesForGroup('protocols');

    expect(protocols).to.be.an('array');

    // updated to match real registry output style
    expect(protocols).to.include.oneOf(['node.http.server', 'node.http.client']);
  });

  it('should include cloud instrumentation when present', () => {
    const cloud = registry.getSpanTypesForGroup('cloud');

    expect(cloud).to.be.an('array');

    if (cloud.length > 0) {
      expect(cloud).to.include.oneOf(['aws.sdk.v2', 'aws.sdk.v3', 'azstorage', 'gcs']);
    }
  });

  it('should return empty array for unknown group', () => {
    expect(registry.getSpanTypesForGroup('unknown')).to.deep.equal([]);
  });

  it('should correctly resolve group for known span types', () => {
    const groups = registry.getInstrumentationGroups();

    for (const [group, spans] of Object.entries(groups)) {
      spans.forEach(span => {
        expect(registry.getGroupForSpanType(span)).to.equal(group);
      });
    }
  });

  it('should return null for unknown span type', () => {
    expect(registry.getGroupForSpanType('unknown')).to.equal(null);
  });

  it('should cache instrumentation groups across calls', () => {
    const first = registry.getInstrumentationGroups();
    const second = registry.getInstrumentationGroups();

    expect(first).to.equal(second);
  });

  it('should not contain duplicate span types in any group', () => {
    const groups = registry.getInstrumentationGroups();

    Object.entries(groups).forEach(([group, spans]) => {
      expect(spans, `${group} has duplicates`).to.deep.equal([...new Set(spans)]);
    });
  });
});
