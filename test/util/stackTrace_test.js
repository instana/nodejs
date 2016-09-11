'use strict';

var expect = require('chai').expect;
var path = require('path');

var stackTrace = require('../../src/util/stackTrace');

describe('util/stackTrace', function() {
  it('must capture stack traces in a handleable format', function() {
    var stack = stackTrace.captureStackTrace(10);
    expect(stack[0].c).to.equal(path.join(__dirname, 'stackTrace_test.js'));
  });

  it('must support custom reference functions', function() {
    var stack;

    (function a() {
      (function b() {
        (function c() {
          (function d() {
            stack = stackTrace.captureStackTrace(10, c);
          })();
        })();
      })();
    })();

    expect(stack[0].f).to.equal('b');
    expect(stack[1].f).to.equal('a');
  });

  it('must restrict length of stack traces', function() {
    var stack;

    (function a() {
      (function b() {
        (function c() {
          (function d() {
            stack = stackTrace.captureStackTrace(2);
          })();
        })();
      })();
    })();

    expect(stack[0].f).to.equal('d');
    expect(stack[1].f).to.equal('c');
    expect(stack).to.have.lengthOf(2);
  });
});
