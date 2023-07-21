/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

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

  it('must not capture stack type string', () => {
    let stack;

    (function a() {
      const stackTraceTarget = { stack: 'this is not an array' };
      const orig = Error.captureStackTrace;
      Error.captureStackTrace = target => {
        Object.assign(target, stackTraceTarget);
      };

      stack = stackTrace.captureStackTrace(2, a);
      Error.captureStackTrace = orig;
    })();

    expect(stack.length).to.equal(0);
  });

  it('must capture stack length < drop', () => {
    const stackTraceTarget = { stack: new Array(5) };
    const orig = Error.captureStackTrace;
    Error.captureStackTrace = target => {
      Object.assign(target, stackTraceTarget);
    };

    const stack = stackTrace.captureStackTrace(2, this, 10);
    Error.captureStackTrace = orig;
    expect(stack.length).to.equal(5);
  });
});
