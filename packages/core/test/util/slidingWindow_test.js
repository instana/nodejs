'use strict';

const sinon = require('sinon');
const expect = require('chai').expect;
const slidingWindow = require('../../src/util/slidingWindow');

describe('slidingWindow', () => {
  let clock;
  let w;

  beforeEach(() => {
    clock = sinon.useFakeTimers();
    w = slidingWindow.create({ duration: 10000 });
  });

  afterEach(() => {
    clock.restore();
  });

  it('should add points and make them available via reducers', () => {
    w.addPoint(5);
    clock.tick(1000);
    w.addPoint(4);

    const result = w.reduce((a, b) => a + b, 0);
    expect(result).to.equal(9);
  });

  it('should only include points that are located in the window', () => {
    w.addPoint(5); // at 0 ms

    clock.tick(1000);
    w.addPoint(4); // at 1000 ms

    clock.tick(3000);
    w.addPoint(2); // at 4000 ms

    clock.tick(10000);
    w.addPoint(6); // at 14000 ms

    const result = w.reduce((a, b) => a + b, 0);
    expect(result).to.equal(8);
  });

  it('should provide the desired percentiles', () => {
    w.addPoint(1);
    w.addPoint(2);
    w.addPoint(3);
    w.addPoint(4);
    w.addPoint(5);

    const percentiles = w.getPercentiles([0.5, 0.25, 0.75, 0.9]);
    expect(percentiles).to.deep.equal([3, 2, 4, 5]);
  });

  it('should handle percentiles when there are no values', () => {
    const percentiles = w.getPercentiles([0.5, 0.25]);
    expect(percentiles).to.deep.equal([0, 0]);
  });

  it('should handle percentiles when there is only one value', () => {
    w.addPoint(5);
    const percentiles = w.getPercentiles([0.5, 0.25, 0.75]);
    expect(percentiles).to.deep.equal([5, 5, 5]);
  });

  it('should return unique values', () => {
    w.addPoint('1foo');
    w.addPoint('3blub');
    w.addPoint('1foo');
    w.addPoint('2bar');

    expect(w.getUniqueValues()).to.deep.equal(['1foo', '2bar', '3blub']);
  });
});
