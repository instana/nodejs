'use strict';

var opentracing = require('opentracing');
var proxyquire = require('proxyquire');
var expect = require('chai').expect;
var sinon = require('sinon');

describe('tracing/opentracing/Span', function() {
  // we know that the actual Span implementation doesn't require access to the OT Tracer
  // instance, so we just pass null to fulfill the OT API contract.
  var tracerInstance = null;

  var now;
  var transmission;
  var Span;
  var span;

  beforeEach(function() {
    now = Date.now();
    transmission = {
      addSpan: sinon.stub()
    };
    Span = proxyquire('../../../src/tracing/opentracing/Span', {
      '../transmission': transmission
    });
    span = new Span(tracerInstance, 'rpc');
  });

  it('must create new spans', function() {
    span = span.span;
    expect(span.t).to.be.a('string');
    expect(span.s).to.be.a('string');
    expect(span.s).to.equal(span.t);
    expect(span.p).to.equal(undefined);
    expect(span.f).to.deep.equal({
      e: String(process.pid),
      h: undefined
    });
    expect(span.async).to.equal(false);
    expect(span.error).to.equal(false);
    expect(span.ec).to.equal(0);
    expect(span.ts).to.be.at.least(now);
    expect(span.d).to.equal(0);
    expect(span.n).to.equal('sdk');
    expect(span.stack).to.be.an('array');
    expect(span.data).to.deep.equal({
      service: undefined,
      sdk: {
        type: 'local',
        name: 'rpc',
        custom: {
          tags: {},
          logs: {}
        }
      }
    });
  });

  it('must be able to change operation name at a later point', function() {
    span.setOperationName('http');
    expect(span.span.data.sdk.name).to.equal('http');
  });

  describe('tags', function() {
    it('must handle error tag differently', function() {
      span.setTag(opentracing.Tags.ERROR, true);
      expect(span.span.error).to.equal(true);
      expect(span.span.ec).to.equal(1);
    });

    it('must support setting error to false', function() {
      span.setTag(opentracing.Tags.ERROR, false);
      expect(span.span.error).to.equal(false);
      expect(span.span.ec).to.equal(0);
    });

    it('must change direction to exit for client rpc kind', function() {
      span.setTag(opentracing.Tags.SPAN_KIND, opentracing.Tags.SPAN_KIND_RPC_CLIENT);
      expect(span.span.data.sdk.type).to.equal('exit');
    });

    it('must change direction to entry for server rpc kind', function() {
      span.setTag(opentracing.Tags.SPAN_KIND, opentracing.Tags.SPAN_KIND_RPC_SERVER);
      expect(span.span.data.sdk.type).to.equal('entry');
    });

    it('must change direction to exit for producer rpc kind', function() {
      span.setTag(opentracing.Tags.SPAN_KIND, 'producer');
      expect(span.span.data.sdk.type).to.equal('exit');
    });

    it('must change direction to entry for consumer rpc kind', function() {
      span.setTag(opentracing.Tags.SPAN_KIND, 'consumer');
      expect(span.span.data.sdk.type).to.equal('entry');
    });

    it('must treat sampling priority changes specially', function() {
      span.setTag(opentracing.Tags.SAMPLING_PRIORITY, 0.5);
      expect(span.context().samplingPriority).to.equal(0.5);
    });

    it('must set all other tags as user provided payload', function() {
      span.setTag('foo', 'bar');
      expect(span.span.data.sdk.custom.tags.foo).to.equal('bar');
    });
  });

  describe('logs', function() {
    it('must set logs without timestamp', function() {
      span.log({
        foo: 'bar'
      });
      var keys = Object.keys(span.span.data.sdk.custom.logs);
      expect(keys).to.have.lengthOf(1);
      expect(parseInt(keys[0], 0)).to.be.at.least(now);
      expect(span.span.data.sdk.custom.logs[keys[0]]).to.deep.equal({
        foo: 'bar'
      });
    });

    it('must set logs with user specified timestamp', function() {
      span.log(
        {
          foo: 'bar'
        },
        5
      );
      var keys = Object.keys(span.span.data.sdk.custom.logs);
      expect(keys).to.have.lengthOf(1);
      expect(keys[0]).to.equal('5');
      expect(span.span.data.sdk.custom.logs[keys[0]]).to.deep.equal({
        foo: 'bar'
      });
    });

    it('must merge log entries with the same timestamp', function() {
      span.log(
        {
          foo: 'bar'
        },
        5
      );
      span.log(
        {
          blub: 'bla'
        },
        5
      );
      var keys = Object.keys(span.span.data.sdk.custom.logs);
      expect(keys).to.have.lengthOf(1);
      expect(keys[0]).to.equal('5');
      expect(span.span.data.sdk.custom.logs[keys[0]]).to.deep.equal({
        foo: 'bar',
        blub: 'bla'
      });
    });

    it('must support log entries of varying timestamps', function() {
      span.log(
        {
          foo: 'bar'
        },
        5
      );
      span.log(
        {
          blub: 'bla'
        },
        6
      );
      expect(span.span.data.sdk.custom.logs).to.deep.equal({
        5: {
          foo: 'bar'
        },
        6: {
          blub: 'bla'
        }
      });
    });
  });

  describe('finish', function() {
    it('must pass span to transmission handler when finishing', function() {
      span.finish();
      expect(transmission.addSpan.callCount).to.equal(1);
      expect(transmission.addSpan.getCall(0).args[0]).to.equal(span.span);
    });

    it('must pass span to transmission handler when finishing with user defined end time', function() {
      span.finish(span.span.ts + 6);
      expect(transmission.addSpan.callCount).to.equal(1);
      expect(transmission.addSpan.getCall(0).args[0]).to.equal(span.span);
      expect(span.span.d).to.equal(6);
    });

    it('must not transmit span when sampling priority is 0', function() {
      span.setTag(opentracing.Tags.SAMPLING_PRIORITY, 0);
      span.finish();
      expect(transmission.addSpan.callCount).to.equal(0);
    });
  });

  describe('fields', function() {
    it('must use start time from passed fields', function() {
      span = new Span(tracerInstance, 'rpc', {
        startTime: 5
      });
      expect(span.span.ts).to.equal(5);
    });

    it('must use tags passed via fields', function() {
      var tags = {};
      tags[opentracing.Tags.SPAN_KIND] = opentracing.Tags.SPAN_KIND_RPC_CLIENT;
      tags[opentracing.Tags.ERROR] = true;
      tags.foo = 'bar';

      span = new Span(tracerInstance, 'rpc', {
        tags: tags
      });

      expect(span.span.data.sdk.custom.tags).to.deep.equal({
        foo: 'bar'
      });
      expect(span.span.error).to.equal(true);
      expect(span.span.data.sdk.type).to.equal('exit');
    });

    it('must use operation name passed via fields when available', function() {
      span = new Span(tracerInstance, 'rpc', {
        operationName: 'oauth'
      });
      expect(span.span.data.sdk.name).to.equal('oauth');
    });
  });

  describe('baggage', function() {
    it('must support set and get baggage items', function() {
      span.setBaggageItem('foo', 'bar');
      expect(span.getBaggageItem('foo')).to.equal('bar');
    });

    it('must return undefined for unknown baggage items', function() {
      expect(span.getBaggageItem('foo')).to.equal(undefined);
    });
  });

  describe('references', function() {
    it('must set trace and parent ID based on child of reference', function() {
      var child = new Span(tracerInstance, 'oauth', {
        references: [opentracing.childOf(span)]
      });
      expect(child.span.t).to.equal(span.span.t);
      expect(child.span.p).to.equal(span.span.s);
      expect(child.span.s).not.to.equal(span.span.s);
    });

    it('must copy sampling priority from parent span', function() {
      span.setTag(opentracing.Tags.SAMPLING_PRIORITY, 0);
      var child = new Span(tracerInstance, 'oauth', {
        references: [opentracing.childOf(span)]
      });
      child.finish();
      expect(transmission.addSpan.callCount).to.equal(0);
    });

    it('must copy baggage from parent span', function() {
      span.setBaggageItem('foo', 'bar');
      var child = new Span(tracerInstance, 'oauth', {
        references: [opentracing.childOf(span)]
      });
      expect(span.getBaggageItem('foo')).to.equal('bar');
      expect(child.getBaggageItem('foo')).to.equal('bar');
    });

    it('must actually copy baggage to keep future baggage mutations from propagating', function() {
      span.setBaggageItem('foo', 'bar');
      var child = new Span(tracerInstance, 'oauth', {
        references: [opentracing.childOf(span)]
      });
      child.setBaggageItem('foo', 'blub');
      expect(span.getBaggageItem('foo')).to.equal('bar');
      expect(child.getBaggageItem('foo')).to.equal('blub');
    });

    it('must support child of span contexts with missing trace relation data', function() {
      var parentContext = span.context();
      delete parentContext.t;
      delete parentContext.s;
      var child = new Span(tracerInstance, 'oauth', {
        references: [opentracing.childOf(parentContext)]
      });
      expect(child.span.t).to.equal(child.span.s);
    });

    it('must set trace and parent ID based on follows from of reference', function() {
      var child = new Span(tracerInstance, 'oauth', {
        references: [opentracing.followsFrom(span)]
      });
      expect(child.span.t).to.equal(span.span.t);
      expect(child.span.p).to.equal(span.span.s);
      expect(child.span.s).not.to.equal(span.span.s);
    });
  });
});
