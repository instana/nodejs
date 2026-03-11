/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const expect = require('chai').expect;
const net = require('net');
const fs = require('fs');

const config = require('@_local/core/test/config');
const testUtils = require('@_local/core/test/test_util');
const { isCI } = require('@_local/core/test/test_util');
const activeResources = require('../src/activeResources');

describe('metrics.activeResources', function () {
  this.timeout(config.getTestTimeout());

  it('should export active resource count', () => {
    // The resources returned by Node depend on how the process is started.
    //
    // Local terminal example:
    // [ 'TTYWrap', 'TTYWrap', 'TTYWrap', 'PipeWrap', 'ProcessWrap' ]
    //
    // CI environments usually pipe stdio instead of attaching a TTY:
    // [ 'PipeWrap', 'PipeWrap', 'PipeWrap', 'ProcessWrap' ]
    //
    // TTYWrap = stdin, stdout, stderr attached to a terminal
    // PipeWrap = internal pipe for process communication (test -> app)
    // ProcessWrap = the child process itself
    expect(activeResources.currentPayload).to.be.an('object');
    if (!isCI()) {
      expect(activeResources.currentPayload.count).to.be.at.least(5);
    } else {
      expect(activeResources.currentPayload.count).to.gte(4);
    }
  });

  it('should update resource count for a setTimeout', () => {
    const timeoutHandle = setTimeout(() => {}, 100);
    // Node attach stdin/stdout/stderr differently depending on environment.
    // Local terminals usually create TTYWrap resources, while CI environments
    // often use PipeWrap. Because of this, the total resource count can vary.
    //
    // Example outputs:
    // Local: [ 'TTYWrap', 'TTYWrap', 'TTYWrap', 'PipeWrap', 'ProcessWrap', 'Timeout' ]
    // CI:    [ 'PipeWrap', 'PipeWrap', 'PipeWrap', 'ProcessWrap', 'Timeout' ]
    // TTYWrap = stdin, stdout, stderr
    // PipeWrap = internal pipe for process communication (test -> app)
    // ProcessWrap = the child process itself
    expect(activeResources.currentPayload).to.be.an('object');
    if (!isCI()) {
      expect(activeResources.currentPayload.count).to.be.at.least(6);
    } else {
      expect(activeResources.currentPayload.count).to.gte(5);
    }
    clearTimeout(timeoutHandle);
  });

  it('should update resource count for a fs.open', () => {
    const initialCount = activeResources.currentPayload.count;
    const count = 13;
    for (let i = 0; i < count; i++) {
      fs.open(__filename, 'r', () => {});
    }
    expect(activeResources.currentPayload).to.be.an('object');
    expect(activeResources.currentPayload.count).to.equal(initialCount + count);
  });

  describe('with net client/server', () => {
    const maxClients = 8;
    /** @type {*} */
    let server;
    /** @type {Array.<*>} */
    const connections = [];
    /** @type {Array.<*>} */
    const clients = [];
    let initialActiveResources = 0;

    before(() => {
      initialActiveResources = activeResources.currentPayload.count;
      server = net
        .createServer(function listener(c) {
          connections.push(c);
        })
        .listen(0, makeConnection);
    });

    after(() => {
      clients.forEach(client => {
        client.destroy();
      });
      connections.forEach(connection => {
        connection.end();
      });
      server.close();
    });

    it('should update resource count for net client and connection', () =>
      testUtils.retry(
        () =>
          new Promise((resolve, reject) => {
            if (clients.length >= maxClients) {
              // Initially is 5 with the test setup.
              // 1 TCPServerWrap because of the server
              // Max Clients is 8 (each 2 TCPSocketWrap because of client and server side)
              // 1 timeoutWrap because of the makeConnection timeout
              expect(activeResources.currentPayload).to.be.an('object');
              expect(activeResources.currentPayload.count).to.be.at.least(initialActiveResources + maxClients * 2 + 1);
              resolve();
            } else {
              reject(new Error('Still waiting for more clients to connect.'));
            }
          })
      ));

    function makeConnection() {
      if (clients.length >= maxClients) {
        return;
      }
      net.connect(server.address().port, function connected() {
        clientConnected(this);
        makeConnection();
      });
    }

    /**
     * @param {*} client
     */
    function clientConnected(client) {
      clients.push(client);
    }
  });
});
