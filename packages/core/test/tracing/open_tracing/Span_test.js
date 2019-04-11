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
  var spanBuffer;
  var Span;

  beforeEach(function() {
    now = Date.now();
    spanBuffer = {
      addSpan: sinon.stub()
    };
    Span = proxyquire('../../../src/tracing/opentracing/Span', {
      '../spanBuffer': spanBuffer
    });
  });

  afterEach(function() {
    Span.init({}, null);
  });

  it('must create new spans', function() {
    var span = new Span(tracerInstance, 'rpc');
    expect(span.span.t).to.be.a('string');
    expect(span.span.s).to.be.a('string');
    expect(span.span.s).to.equal(span.span.t);
    expect(span.span.p).to.equal(undefined);
    expect(span.span.async).to.equal(false);
    expect(span.span.error).to.equal(false);
    expect(span.span.ec).to.equal(0);
    expect(span.span.ts).to.be.at.least(now);
    expect(span.span.d).to.equal(0);
    expect(span.span.n).to.equal('sdk');
    expect(span.span.stack).to.be.an('array');
    expect(span.span.data).to.deep.equal({
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

  it('must not set span.f without process identity provider', function() {
    var span = new Span(tracerInstance, 'rpc');
    expect(span.span).to.not.have.property('f');
  });

  it('must not set span.f if process identity provider does not support getFrom', function() {
    Span.init({}, {});
    var span = new Span(tracerInstance, 'rpc');
    expect(span.span).to.not.have.property('f');
  });

  it('must use process identity provider', function() {
    Span.init(
      {},
      {
        getFrom: function() {
          return {
            e: String(process.pid),
            h: undefined
          };
        }
      }
    );
    var span = new Span(tracerInstance, 'rpc');
    expect(span.span.f).to.deep.equal({
      e: String(process.pid),
      h: undefined
    });
  });

  it('must be able to change operation name at a later point', function() {
    var span = new Span(tracerInstance, 'rpc');
    span.setOperationName('http');
    expect(span.span.data.sdk.name).to.equal('http');
  });

  describe('tags', function() {
    it('must handle error tag differently', function() {
      var span = new Span(tracerInstance, 'rpc');
      span.setTag(opentracing.Tags.ERROR, true);
      expect(span.span.error).to.equal(true);
      expect(span.span.ec).to.equal(1);
    });

    it('must support setting error to false', function() {
      var span = new Span(tracerInstance, 'rpc');
      span.setTag(opentracing.Tags.ERROR, false);
      expect(span.span.error).to.equal(false);
      expect(span.span.ec).to.equal(0);
    });

    it('must change direction to exit for client rpc kind', function() {
      var span = new Span(tracerInstance, 'rpc');
      span.setTag(opentracing.Tags.SPAN_KIND, opentracing.Tags.SPAN_KIND_RPC_CLIENT);
      expect(span.span.data.sdk.type).to.equal('exit');
    });

    it('must change direction to entry for server rpc kind', function() {
      var span = new Span(tracerInstance, 'rpc');
      span.setTag(opentracing.Tags.SPAN_KIND, opentracing.Tags.SPAN_KIND_RPC_SERVER);
      expect(span.span.data.sdk.type).to.equal('entry');
    });

    it('must change direction to exit for producer rpc kind', function() {
      var span = new Span(tracerInstance, 'rpc');
      span.setTag(opentracing.Tags.SPAN_KIND, 'producer');
      expect(span.span.data.sdk.type).to.equal('exit');
    });

    it('must change direction to entry for consumer rpc kind', function() {
      var span = new Span(tracerInstance, 'rpc');
      span.setTag(opentracing.Tags.SPAN_KIND, 'consumer');
      expect(span.span.data.sdk.type).to.equal('entry');
    });

    it('must treat sampling priority changes specially', function() {
      var span = new Span(tracerInstance, 'rpc');
      span.setTag(opentracing.Tags.SAMPLING_PRIORITY, 0.5);
      expect(span.context().samplingPriority).to.equal(0.5);
    });

    it('must set all other tags as user provided payload', function() {
      var span = new Span(tracerInstance, 'rpc');
      span.setTag('foo', 'bar');
      expect(span.span.data.sdk.custom.tags.foo).to.equal('bar');
    });
  });

  describe('logs', function() {
    it('must set logs without timestamp', function() {
      var span = new Span(tracerInstance, 'rpc');
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
      var span = new Span(tracerInstance, 'rpc');
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
      var span = new Span(tracerInstance, 'rpc');
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
      var span = new Span(tracerInstance, 'rpc');
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
    it('must pass span to spanBuffer handler when finishing', function() {
      var span = new Span(tracerInstance, 'rpc');
      span.finish();
      expect(spanBuffer.addSpan.callCount).to.equal(1);
      expect(spanBuffer.addSpan.getCall(0).args[0]).to.equal(span.span);
    });

    it('must pass span to spanBuffer handler when finishing with user defined end time', function() {
      var span = new Span(tracerInstance, 'rpc');
      span.finish(span.span.ts + 6);
      expect(spanBuffer.addSpan.callCount).to.equal(1);
      expect(spanBuffer.addSpan.getCall(0).args[0]).to.equal(span.span);
      expect(span.span.d).to.equal(6);
    });

    it('must not transmit span when sampling priority is 0', function() {
      var span = new Span(tracerInstance, 'rpc');
      span.setTag(opentracing.Tags.SAMPLING_PRIORITY, 0);
      span.finish();
      expect(spanBuffer.addSpan.callCount).to.equal(0);
    });
  });

  describe('fields', function() {
    it('must use start time from passed fields', function() {
      var span = new Span(tracerInstance, 'rpc');
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

      var span = new Span(tracerInstance, 'rpc', {
        tags: tags
      });

      expect(span.span.data.sdk.custom.tags).to.deep.equal({
        foo: 'bar'
      });
      expect(span.span.error).to.equal(true);
      expect(span.span.data.sdk.type).to.equal('exit');
    });

    it('must use operation name passed via fields when available', function() {
      var span = new Span(tracerInstance, 'rpc', {
        operationName: 'oauth'
      });
      expect(span.span.data.sdk.name).to.equal('oauth');
    });
  });

  describe('baggage', function() {
    it('must support set and get baggage items', function() {
      var span = new Span(tracerInstance, 'rpc');
      span.setBaggageItem('foo', 'bar');
      expect(span.getBaggageItem('foo')).to.equal('bar');
    });

    it('must return undefined for unknown baggage items', function() {
      var span = new Span(tracerInstance, 'rpc');
      expect(span.getBaggageItem('foo')).to.equal(undefined);
    });
  });

  describe('references', function() {
    it('must set trace and parent ID based on child of reference', function() {
      var span = new Span(tracerInstance, 'rpc');
      var child = new Span(tracerInstance, 'oauth', {
        references: [opentracing.childOf(span)]
      });
      expect(child.span.t).to.equal(span.span.t);
      expect(child.span.p).to.equal(span.span.s);
      expect(child.span.s).not.to.equal(span.span.s);
    });

    it('must copy sampling priority from parent span', function() {
      var span = new Span(tracerInstance, 'rpc');
      span.setTag(opentracing.Tags.SAMPLING_PRIORITY, 0);
      var child = new Span(tracerInstance, 'oauth', {
        references: [opentracing.childOf(span)]
      });
      child.finish();
      expect(spanBuffer.addSpan.callCount).to.equal(0);
    });

    it('must copy baggage from parent span', function() {
      var span = new Span(tracerInstance, 'rpc');
      span.setBaggageItem('foo', 'bar');
      var child = new Span(tracerInstance, 'oauth', {
        references: [opentracing.childOf(span)]
      });
      expect(span.getBaggageItem('foo')).to.equal('bar');
      expect(child.getBaggageItem('foo')).to.equal('bar');
    });

    it('must actually copy baggage to keep future baggage mutations from propagating', function() {
      var span = new Span(tracerInstance, 'rpc');
      span.setBaggageItem('foo', 'bar');
      var child = new Span(tracerInstance, 'oauth', {
        references: [opentracing.childOf(span)]
      });
      child.setBaggageItem('foo', 'blub');
      expect(span.getBaggageItem('foo')).to.equal('bar');
      expect(child.getBaggageItem('foo')).to.equal('blub');
    });

    it('must support child of span contexts with missing trace relation data', function() {
      var span = new Span(tracerInstance, 'rpc');
      var parentContext = span.context();
      delete parentContext.t;
      delete parentContext.s;
      var child = new Span(tracerInstance, 'oauth', {
        references: [opentracing.childOf(parentContext)]
      });
      expect(child.span.t).to.equal(child.span.s);
    });

    it('must set trace and parent ID based on follows from of reference', function() {
      var span = new Span(tracerInstance, 'rpc');
      var child = new Span(tracerInstance, 'oauth', {
        references: [opentracing.followsFrom(span)]
      });
      expect(child.span.t).to.equal(span.span.t);
      expect(child.span.p).to.equal(span.span.s);
      expect(child.span.s).not.to.equal(span.span.s);
    });
  });
});
