'use strict';

const expect = require('chai').expect;
const path = require('path');

const stackTrace = require('../../src/util/stackTrace');

describe('util/stackTrace', () => {
  it('must capture stack traces in a handleable format', () => {
    const stack = stackTrace.captureStackTrace(10);
    expect(stack[0].c).to.equal(path.join(__dirname, 'stackTrace_test.js'));
  });

  it('must support custom reference functions', () => {
    let stack;

    (function a() {
      (function b() {
        (function c() {
          (function d() {
            stack = stackTrace.captureStackTrace(10, c);
          })();
        })();
      })();
    })();

    expect(stack[0].m).to.equal('b');
    expect(stack[1].m).to.equal('a');
  });

  it('must restrict length of stack traces', () => {
    let stack;

    (function a() {
      (function b() {
        (function c() {
          (function d() {
            stack = stackTrace.captureStackTrace(2);
          })();
        })();
      })();
    })();

    expect(stack[0].m).to.equal('d');
    expect(stack[1].m).to.equal('c');
    expect(stack).to.have.lengthOf(2);
  });
});
