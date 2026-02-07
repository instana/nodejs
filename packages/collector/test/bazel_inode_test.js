/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const { expect } = require('chai');
const proxyquire = require('proxyquire');
const EventEmitter = require('events');
const testUtils = require('@_local/core/test/test_util');

class MockRequestEmitter extends EventEmitter {
  setTimeout() {}

  write(payload) {
    this.payload = payload;
  }

  end() {}
}

class MockResponseEmitter extends EventEmitter {
  setEncoding() {}
}

describe('agent connection/bazel', function () {
  let agentConnection;
  let lastRequest;

  describe("Bazel's node-patches are present", () => {
    before(() => {
      agentConnection = proxyquire('../src/agentConnection', {
        // stub out the http communication part of the announce request
        '@_local/core': mockInstanaCoreHttp()
      });

      agentConnection.init({ logger: testUtils.createFakeLogger() }, { pid: 1234 });
    });

    it('should remove the leading path segmentes which node-patches prepends', done => {
      agentConnection.announceNodeCollector(() => {
        const announcePayload = JSON.parse(lastRequest.payload.toString());
        expect(announcePayload.fd).to.equal('13');
        expect(announcePayload.inode).to.equal('socket:[12345]');
        done();
      });
    });
  });

  describe("Bazel's node-patches are not present", () => {
    before(() => {
      agentConnection = proxyquire('../src/agentConnection', {
        // Stub out the fs part part of the fd/inode lookup (the readlinkSync call), and act as if node-patches from
        // Bazel were not active, that is, act like an unpatched fs modules would work on Linux and return an
        // unqualified file name (no absolute path) from readlinkSync.
        fs: mockFs('socket:[12345]'),

        // stub out the http communication part of the announce request
        '@_local/core': mockInstanaCoreHttp()
      });

      agentConnection.init({ logger: testUtils.createFakeLogger() }, { pid: 1234 });
    });

    it('should not modify the readlinkSync result', done => {
      agentConnection.announceNodeCollector(() => {
        const announcePayload = JSON.parse(lastRequest.payload.toString());
        expect(announcePayload.fd).to.equal('13');
        expect(announcePayload.inode).to.equal('socket:[12345]');
        done();
      });
    });
  });

  function mockFs(readlinkSyncResult) {
    return {
      readlinkSync: () => readlinkSyncResult
    };
  }

  function mockInstanaCoreHttp() {
    return {
      uninstrumentedHttp: {
        http: {
          request: function (options, responseCallback) {
            const req = new MockRequestEmitter();
            lastRequest = req;

            setImmediate(() => {
              req.emit('socket', {
                _handle: {
                  fd: '13'
                }
              });

              setImmediate(() => {
                const res = new MockResponseEmitter();
                res.statusCode = 200;
                responseCallback(res);

                setImmediate(() => {
                  res.emit('end');
                });
              });
            });
            return req;
          }
        }
      },
      // Stub out the fs part part of the fd/inode lookup (the readlinkSync call), and act as if node-patches from
      // Bazel were active, that is, return an absolute path from readlinkSync.
      uninstrumentedFs: mockFs(`/proc/${process.pid}/fd/socket:[12345]`)
    };
  }
});
