/* eslint-env mocha */

'use strict';

var sinon = require('sinon');
var expect = require('chai').expect;
var slidingWindow = require('../src/slidingWindow');

describe('slidingWindow', function() {
  var clock;
  var w;

  beforeEach(function() {
    clock = sinon.useFakeTimers();
    w = slidingWindow.create({ duration: 10000 });
  });

  afterEach(function() {
    clock.restore();
  });

  it('should add points and make them available via reducers', function() {
    w.addPoint(5);
    clock.tick(1000);
    w.addPoint(4);

    var result = w.reduce(function(a, b) {
      return a + b;
    }, 0);
    expect(result).to.equal(9);
  });

  it('should only include points that are located in the window', function() {
    w.addPoint(5); // at 0ms

    clock.tick(1000);
    w.addPoint(4); // at 1000ms

    clock.tick(3000);
    w.addPoint(2); // at 4000ms

    clock.tick(10000);
    w.addPoint(6); // at 14000ms

    var result = w.reduce(function(a, b) {
      return a + b;
    }, 0);
    expect(result).to.equal(8);
  });

  it('should provide the desired percentiles', function() {
    w.addPoint(1);
    w.addPoint(2);
    w.addPoint(3);
    w.addPoint(4);
    w.addPoint(5);

    var percentiles = w.getPercentiles([0.5, 0.25, 0.75, 0.9]);
    expect(percentiles).to.deep.equal([3, 2, 4, 5]);
  });

  it('should handle percentiles when there are no values', function() {
    var percentiles = w.getPercentiles([0.5, 0.25]);
    expect(percentiles).to.deep.equal([0, 0]);
  });

  it('should handle percentiles when there is only one value', function() {
    w.addPoint(5);
    var percentiles = w.getPercentiles([0.5, 0.25, 0.75]);
    expect(percentiles).to.deep.equal([5, 5, 5]);
  });

  it('should return unique values', function() {
    w.addPoint('1foo');
    w.addPoint('3blub');
    w.addPoint('1foo');
    w.addPoint('2bar');

    expect(w.getUniqueValues()).to.deep.equal(['1foo', '2bar', '3blub']);
  });
});
