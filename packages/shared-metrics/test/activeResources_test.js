/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const expect = require('chai').expect;
const net = require('net');
const fs = require('fs');

const config = require('@instana/core/test/config');
const testUtils = require('@instana/core/test/test_util');
const activeResources = require('../src/activeResources');

describe('metrics.activeResources', function () {
  this.timeout(config.getTestTimeout());

  it('should export active resource count', () => {
    // [ 'TTYWrap', 'TTYWrap', 'TTYWrap', 'PipeWrap', 'ProcessWrap' ]
    // Teletypewriter = stdin, stdout, stderr
    // PipeWrap = internal pipe for process communication (test -> app)
    // ProcessWrap = the child process itself
    expect(activeResources.currentPayload).to.equal(5);
  });

  it('should update resource count for a setTimeout', () => {
    const timeoutHandle = setTimeout(() => {}, 100);

    // [ 'TTYWrap', 'TTYWrap', 'TTYWrap', 'PipeWrap', 'ProcessWrap', 'Timeout' ]
    expect(activeResources.currentPayload).to.equal(6);
    clearTimeout(timeoutHandle);
  });

  it('should update requests count for a fs.open', () => {
    const initialCount = activeResources.currentPayload;
    const count = 13;
    for (let i = 0; i < count; i++) {
      fs.open(__filename, 'r', () => {});
    }
    expect(activeResources.currentPayload).to.equal(initialCount + count);
  });

  describe('with net client/server', () => {
    /* eslint-disable max-len */
    // Inspired by
    // https://github.com/nodejs/node/blob/01422769775a2ce7dfef8aa6dbda2d326f002e13/test/parallel/test-process-getactivehandles.js

    const maxClients = 8;
    /** @type {*} */
    let server;
    /** @type {Array.<*>} */
    const connections = [];
    /** @type {Array.<*>} */
    const clients = [];
    let initialActiveResources = 0;

    before(() => {
      initialActiveResources = activeResources.currentPayload;
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

    it('should update handle count for net client and connection', () =>
      testUtils.retry(
        () =>
          new Promise((resolve, reject) => {
            if (clients.length >= maxClients) {
              // Initially is 5 with the test setup.
              // 1 TCPServerWrap because of the server
              // Max Clients is 8 (each 2 TCPSocketWrap because of client and server side)
              // 1 timeoutWrap because of the makeConnection timeout
              expect(activeResources.currentPayload).to.be.at.least(initialActiveResources + 1 * (maxClients * 2) + 1);
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
