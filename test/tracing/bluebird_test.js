'use strict';

var supportedVersion = require('../../src/tracing/index').supportedVersion;
var Tracer = require('../../src/tracing/opentracing/Tracer');
var cls = require('../../src/tracing/cls');
var expect = require('chai').expect;
var config = require('../config');
var Promise = require('bluebird');
var utils = require('../utils');
var assert = require('assert');

describe('tracing/bluebirdOutsideOfApp', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  this.timeout(config.getTestTimeout());

  it('must keep context across promises', function() {
    cls.ns.runAndReturn(function() {
      var res;
      var rej;
      cls.ns.set('value1', 1);
      new Promise(function(resolve, reject) {
        cls.ns.set('value2', 2);
        res = resolve;
        rej = reject;
      }).then(function() {
        assert.equal(1, cls.ns.get('value1'));
        assert.equal(2, cls.ns.get('value2'));
      });
      assert(res);
      assert(rej);
      assert.equal(1, cls.ns.get('value1'));
      assert.equal(2, cls.ns.get('value2'));
    });
  });

  it('must keep context through promise exceptions', function() {
    function StanTestError() {}
    StanTestError.prototype = Object.create(Error.prototype);

    cls.ns.runAndReturn(function() {
      new Promise(function() {
        cls.ns.set('value1', 1);
      }).then(function() {
        cls.ns.set('value2', 2);
        assert.equal(1, cls.ns.get('value1'));
        setTimeout(function() {
          throw new StanTestError();
        }, 500);
      }).catch(StanTestError, function(e) {
        cls.ns.set('value3', 3);
        cls.ns.set('e', e);
        assert.equal(1, cls.ns.get('value1'));
        assert.equal(2, cls.ns.get('value2'));
        return Promise.resolve('success!');
      }).then(function() {
        assert.equal(1, cls.ns.get('value1'));
        assert.equal(2, cls.ns.get('value2'));
      });
    });
  });

  it('must keep context through delays', function() {
    cls.ns.runAndReturn(function() {
      cls.ns.set('value1', 1);
      Promise.delay(500).then(function() {
          assert.equal(1, cls.ns.get('value1'));
          cls.ns.set('value2', 2);
          return 'Hello world';
      }).delay(500).then(function(helloWorldString) {
          assert.equal(2, cls.ns.get('value2'));
          assert.equal(helloWorldString, 'Hello world');
      });
      assert.equal(1, cls.ns.get('value1'));
    });
  });

  it('must properly trace across delayed promise boundaries', function() {
    var outsideSpan;
    var insideSpan;
    var tracer = new Tracer(true);

    return cls.ns.runAndReturn(function() {
      outsideSpan = tracer.startSpan('outside_promise');
      cls.ns.set('outsideSpan', outsideSpan);

      return Promise.delay(10)
      .then(function() {
          var os1 = cls.ns.get('outsideSpan');
          insideSpan = tracer.startSpan('outside_promise', {childOf: os1});
          cls.ns.set('insideSpan', insideSpan);
          insideSpan.finish();
          return 'Hello world';
      }).delay(10).then(function(helloWorldString) {
        outsideSpan.setTag('hw', helloWorldString);
        outsideSpan.finish();
      })
      .delay(500).then(function() {
        return utils.retry(function() {
          expect(insideSpan.span.p).to.equal(outsideSpan.span.s);
          expect(outsideSpan.span.data.sdk.custom.tags.hw).to.equal('Hello world');
        });
      });
    });
  });
});
