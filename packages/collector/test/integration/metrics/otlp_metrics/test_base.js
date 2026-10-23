/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const expect = require('chai').expect;
const config = require('@_local/core/test/config');
const { retry } = require('@_local/core/test/test_util');
const { AgentStubControls } = require('@_local/collector/test/apps/agentStubControls');
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');

module.exports = function () {
  this.timeout(config.getTestTimeout());

  let agentControls;
  let controls;

  before(async () => {
    agentControls = new AgentStubControls();
    await agentControls.startAgent();

    controls = new ProcessControls({
      dirname: __dirname,
      appName: 'app',
      agentControls
    });

    await controls.startAndWaitForAgentConnection();
  });

  after(async () => {
    await controls.stop();
    await agentControls.stopAgent();
  });

  it('sends OTLP-shaped metrics to /v1/metrics', () =>
    retry(async () => {
      const data = await agentControls.getReceivedData();
      const otlpMetrics = data.metrics.filter(m => m.data && m.data.resourceMetrics);
      expect(otlpMetrics).to.have.length.at.least(1);

      const payload = otlpMetrics[otlpMetrics.length - 1].data;
      expect(payload).to.have.property('resourceMetrics').that.is.an('array').with.length.at.least(1);

      const rm = payload.resourceMetrics[0];
      expect(rm).to.have.property('resource');
      expect(rm).to.have.property('scopeMetrics').that.is.an('array').with.length.at.least(1);

      const scope = rm.scopeMetrics[0].scope;
      expect(scope).to.have.property('name').that.is.a('string').and.is.not.empty;
      expect(scope).to.have.property('version').that.is.a('string').and.is.not.empty;

      const metrics = rm.scopeMetrics[0].metrics;
      expect(metrics).to.be.an('array').with.length.at.least(1);

      const names = metrics.map(m => m.name);
      expect(names).to.include('v8js.gc.duration');
      expect(names).to.include('v8js.memory.heap.space.available_size');
      expect(names).to.include('v8js.resource.active');
      expect(names).to.include('nodejs.eventloop.delay.min');
      expect(names).to.include('nodejs.eventloop.delay.max');
      expect(names).to.include('nodejs.eventloop.delay.mean');
    }));

  it('resource attributes include required OTLP fields', () =>
    retry(async () => {
      const data = await agentControls.getReceivedData();
      const otlpMetrics = data.metrics.filter(m => m.data && m.data.resourceMetrics);
      expect(otlpMetrics).to.have.length.at.least(1);

      const attrs = otlpMetrics[otlpMetrics.length - 1].data.resourceMetrics[0].resource.attributes;

      function findAttr(key) {
        return attrs.find(a => a.key === key);
      }

      expect(findAttr('telemetry.sdk.language')).to.have.nested.property('value.stringValue', 'nodejs');
      expect(findAttr('telemetry.sdk.name')).to.have.nested.property('value.stringValue', 'instana');
      expect(findAttr('telemetry.sdk.version')).to.have.nested.property('value.stringValue').that.is.not.empty;
      expect(findAttr('host.name')).to.have.nested.property('value.stringValue').that.is.not.empty;
      expect(findAttr('os.type')).to.have.nested.property('value.stringValue').that.is.not.empty;
    }));

  it('v8js.gc.duration data points have the correct OTLP histogram shape', () =>
    retry(async () => {
      const data = await agentControls.getReceivedData();
      const otlpMetrics = data.metrics.filter(m => m.data && m.data.resourceMetrics);
      expect(otlpMetrics).to.have.length.at.least(1);

      const metrics = otlpMetrics[otlpMetrics.length - 1].data.resourceMetrics[0].scopeMetrics[0].metrics;
      const gcMetric = metrics.find(m => m.name === 'v8js.gc.duration');
      expect(gcMetric).to.exist;
      expect(gcMetric).to.have.property('histogram');
      expect(gcMetric.histogram.aggregationTemporality).to.equal(1);

      gcMetric.histogram.dataPoints.forEach(dp => {
        expect(dp).to.have.property('sum').that.is.a('number');
        expect(dp).to.have.property('count').that.is.a('number');
        expect(dp).to.have.property('bucketCounts').that.deep.equals([1]);
        expect(dp).to.have.property('explicitBounds').that.deep.equals([]);
        expect(dp.timeUnixNano).to.be.a('string').and.match(/^\d+$/);
      });
    }));

  it('v8js.memory.heap.space.available_size emits one data point per heap space', () =>
    retry(async () => {
      const data = await agentControls.getReceivedData();
      const otlpMetrics = data.metrics.filter(m => m.data && m.data.resourceMetrics);
      expect(otlpMetrics).to.have.length.at.least(1);

      const metrics = otlpMetrics[otlpMetrics.length - 1].data.resourceMetrics[0].scopeMetrics[0].metrics;
      const heapMetric = metrics.find(m => m.name === 'v8js.memory.heap.space.available_size');
      expect(heapMetric).to.exist;
      expect(heapMetric.sum.aggregationTemporality).to.equal(2);
      expect(heapMetric.sum.isMonotonic).to.equal(false);
      expect(heapMetric.sum.dataPoints).to.have.length.at.least(1);

      heapMetric.sum.dataPoints.forEach(dp => {
        const spaceAttr = dp.attributes.find(a => a.key === 'v8js.heap.space.name');
        expect(spaceAttr).to.exist;
        expect(spaceAttr.value.stringValue).to.be.a('string').and.is.not.empty;
        expect(dp).to.have.property('asInt').that.is.a('number');
      });
    }));
};
