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

  describe('parseStackTraceFromString', () => {
    it('must parse stack trace with function names and file paths', () => {
      const stackString = `Error: test error
    at ClientRequest.<anonymous> (/artifacts/node_modules/node-fetch-v2/lib/index.js:1501:11)
    at ClientRequest.emit (node:events:519:28)
    at Socket.socketErrorListener (node:_http_client:574:5)`;

      const result = stackTrace.parseStackTraceFromString(stackString);

      expect(result).to.be.an('array');
      expect(result).to.have.lengthOf(3);

      expect(result[0].m).to.equal('ClientRequest.<anonymous>');
      expect(result[0].c).to.equal('/artifacts/node_modules/node-fetch-v2/lib/index.js');
      expect(result[0].n).to.equal(1501);

      expect(result[1].m).to.equal('ClientRequest.emit');
      expect(result[1].c).to.equal('node:events');
      expect(result[1].n).to.equal(519);

      expect(result[2].m).to.equal('Socket.socketErrorListener');
      expect(result[2].c).to.equal('node:_http_client');
      expect(result[2].n).to.equal(574);
    });

    it('must parse stack trace with anonymous functions', () => {
      const stackString = `Error: test error
    at /path/to/file.js:123:45
    at node:internal/process/task_queues:90:21`;

      const result = stackTrace.parseStackTraceFromString(stackString);

      expect(result).to.be.an('array');
      expect(result).to.have.lengthOf(2);

      expect(result[0].m).to.equal('<anonymous>');
      expect(result[0].c).to.equal('/path/to/file.js');
      expect(result[0].n).to.equal(123);

      expect(result[1].m).to.equal('<anonymous>');
      expect(result[1].c).to.equal('node:internal/process/task_queues');
      expect(result[1].n).to.equal(90);
    });

    it('must handle empty or invalid input', () => {
      expect(stackTrace.parseStackTraceFromString('')).to.deep.equal([]);
      expect(stackTrace.parseStackTraceFromString(null)).to.deep.equal([]);
      expect(stackTrace.parseStackTraceFromString(undefined)).to.deep.equal([]);
      expect(stackTrace.parseStackTraceFromString('no stack trace here')).to.deep.equal([]);
    });

    it('must parse stack trace with mixed formats', () => {
      const stackString = `Error: test error
    at Object.method (/path/to/file.js:100:20)
    at /another/file.js:50:10
    at process.processTicksAndRejections (node:internal/process/task_queues:90:21)`;

      const result = stackTrace.parseStackTraceFromString(stackString);

      expect(result).to.be.an('array');
      expect(result).to.have.lengthOf(3);

      expect(result[0].m).to.equal('Object.method');
      expect(result[0].c).to.equal('/path/to/file.js');
      expect(result[0].n).to.equal(100);

      expect(result[1].m).to.equal('<anonymous>');
      expect(result[1].c).to.equal('/another/file.js');
      expect(result[1].n).to.equal(50);

      expect(result[2].m).to.equal('process.processTicksAndRejections');
      expect(result[2].c).to.equal('node:internal/process/task_queues');
      expect(result[2].n).to.equal(90);
    });

    it('must handle stack traces with only function names', () => {
      const stackString = `Error: test error
    at someFunction
    at anotherFunction`;

      const result = stackTrace.parseStackTraceFromString(stackString);

      expect(result).to.be.an('array');
      expect(result).to.have.lengthOf(2);

      expect(result[0].m).to.equal('someFunction');
      expect(result[0].c).to.be.undefined;
      expect(result[0].n).to.be.undefined;

      expect(result[1].m).to.equal('anotherFunction');
      expect(result[1].c).to.be.undefined;
      expect(result[1].n).to.be.undefined;
    });

    it('must skip error message line', () => {
      const stackString = `FetchError: request to http://localhost:3564/ failed, reason: connect ECONNREFUSED
    at ClientRequest.<anonymous> (/path/to/file.js:100:20)`;

      const result = stackTrace.parseStackTraceFromString(stackString);

      expect(result).to.be.an('array');
      expect(result).to.have.lengthOf(1);
      expect(result[0].m).to.equal('ClientRequest.<anonymous>');
    });

    it('must handle Windows-style paths with drive letters', () => {
      const stackString = `Error: test error
    at myFunction (C:\\Program Files\\app\\index.js:42:10)
    at anotherFunc (D:\\Users\\test\\file.js:100:5)`;

      const result = stackTrace.parseStackTraceFromString(stackString);

      expect(result).to.be.an('array');
      expect(result).to.have.lengthOf(2);

      expect(result[0].m).to.equal('myFunction');
      expect(result[0].c).to.equal('C:\\Program Files\\app\\index.js');
      expect(result[0].n).to.equal(42);

      expect(result[1].m).to.equal('anotherFunc');
      expect(result[1].c).to.equal('D:\\Users\\test\\file.js');
      expect(result[1].n).to.equal(100);
    });

    it('must handle stack traces with column numbers', () => {
      const stackString = `Error: test error
    at func (/path/to/file.js:10:25)
    at another (/path/to/other.js:50:100)`;

      const result = stackTrace.parseStackTraceFromString(stackString);

      expect(result).to.be.an('array');
      expect(result).to.have.lengthOf(2);

      expect(result[0].m).to.equal('func');
      expect(result[0].c).to.equal('/path/to/file.js');
      expect(result[0].n).to.equal(10);

      expect(result[1].m).to.equal('another');
      expect(result[1].c).to.equal('/path/to/other.js');
      expect(result[1].n).to.equal(50);
    });

    it('must handle stack traces without column numbers', () => {
      const stackString = `Error: test error
    at func (/path/to/file.js:10)
    at another (/path/to/other.js:50)`;

      const result = stackTrace.parseStackTraceFromString(stackString);

      expect(result).to.be.an('array');
      expect(result).to.have.lengthOf(2);

      expect(result[0].m).to.equal('func');
      expect(result[0].c).to.equal('/path/to/file.js');
      expect(result[0].n).to.equal(10);

      expect(result[1].m).to.equal('another');
      expect(result[1].c).to.equal('/path/to/other.js');
      expect(result[1].n).to.equal(50);
    });

    it('must handle deeply nested function names', () => {
      const stackString = `Error: test error
    at Object.Module._extensions..js (node:internal/modules/cjs/loader:1310:10)
    at Module.load (node:internal/modules/cjs/loader:1119:32)`;

      const result = stackTrace.parseStackTraceFromString(stackString);

      expect(result).to.be.an('array');
      expect(result).to.have.lengthOf(2);

      expect(result[0].m).to.equal('Object.Module._extensions..js');
      expect(result[0].c).to.equal('node:internal/modules/cjs/loader');
      expect(result[0].n).to.equal(1310);

      expect(result[1].m).to.equal('Module.load');
      expect(result[1].c).to.equal('node:internal/modules/cjs/loader');
      expect(result[1].n).to.equal(1119);
    });

    it('must handle async stack traces', () => {
      const stackString = `Error: test error
    at async myAsyncFunction (/path/to/file.js:100:20)
    at async Promise.all (index 0)`;

      const result = stackTrace.parseStackTraceFromString(stackString);

      expect(result).to.be.an('array');
      expect(result).to.have.lengthOf(2);

      expect(result[0].m).to.equal('async myAsyncFunction');
      expect(result[0].c).to.equal('/path/to/file.js');
      expect(result[0].n).to.equal(100);
    });

    it('must handle native code references', () => {
      const stackString = `Error: test error
    at Array.map
    at myFunction (/path/to/file.js:10:5)`;

      const result = stackTrace.parseStackTraceFromString(stackString);

      expect(result).to.be.an('array');
      expect(result).to.have.lengthOf(2);

      expect(result[0].m).to.equal('Array.map');
      expect(result[0].c).to.be.undefined;
      expect(result[0].n).to.be.undefined;

      expect(result[1].m).to.equal('myFunction');
      expect(result[1].c).to.equal('/path/to/file.js');
      expect(result[1].n).to.equal(10);
    });

    it('must handle URLs in file paths', () => {
      const stackString = `Error: test error
    at func (http://localhost:3000/app.js:10:5)
    at another (https://example.com:8080/lib/index.js:50:10)`;

      const result = stackTrace.parseStackTraceFromString(stackString);

      expect(result).to.be.an('array');
      expect(result).to.have.lengthOf(2);

      expect(result[0].m).to.equal('func');
      expect(result[0].c).to.equal('http://localhost:3000/app.js');
      expect(result[0].n).to.equal(10);

      expect(result[1].m).to.equal('another');
      expect(result[1].c).to.equal('https://example.com:8080/lib/index.js');
      expect(result[1].n).to.equal(50);
    });

    it('must handle file:// protocol paths', () => {
      const stackString = `Error: test error
    at func (file:///path/to/file.js:10:5)`;

      const result = stackTrace.parseStackTraceFromString(stackString);

      expect(result).to.be.an('array');
      expect(result).to.have.lengthOf(1);

      expect(result[0].m).to.equal('func');
      expect(result[0].c).to.equal('file:///path/to/file.js');
      expect(result[0].n).to.equal(10);
    });

    it('must handle constructor calls', () => {
      const stackString = `Error: test error
    at new MyClass (/path/to/file.js:10:5)
    at new AnotherClass (/path/to/other.js:20:10)`;

      const result = stackTrace.parseStackTraceFromString(stackString);

      expect(result).to.be.an('array');
      expect(result).to.have.lengthOf(2);

      expect(result[0].m).to.equal('new MyClass');
      expect(result[0].c).to.equal('/path/to/file.js');
      expect(result[0].n).to.equal(10);

      expect(result[1].m).to.equal('new AnotherClass');
      expect(result[1].c).to.equal('/path/to/other.js');
      expect(result[1].n).to.equal(20);
    });

    it('must handle eval and anonymous eval contexts', () => {
      const stackString = `Error: test error
    at eval (eval at <anonymous> (/path/to/file.js:10:5), <anonymous>:1:1)
    at Object.<anonymous> (/path/to/file.js:10:5)`;

      const result = stackTrace.parseStackTraceFromString(stackString);

      expect(result).to.be.an('array');
      // The eval line is complex and may not parse perfectly, but should not crash
      expect(result.length).to.be.greaterThan(0);
    });

    it('must handle stack traces with special characters in function names', () => {
      const stackString = `Error: test error
    at Object.<anonymous> (/path/to/file.js:10:5)
    at Module._compile (/path/to/module.js:20:10)`;

      const result = stackTrace.parseStackTraceFromString(stackString);

      expect(result).to.be.an('array');
      expect(result).to.have.lengthOf(2);

      expect(result[0].m).to.equal('Object.<anonymous>');
      expect(result[0].c).to.equal('/path/to/file.js');
      expect(result[0].n).to.equal(10);

      expect(result[1].m).to.equal('Module._compile');
      expect(result[1].c).to.equal('/path/to/module.js');
      expect(result[1].n).to.equal(20);
    });
  });
});
