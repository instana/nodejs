/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const expect = require('chai').expect;
const semver = require('semver');
const net = require('net');

const config = require('@instana/core/test/config');
const testUtils = require('@instana/core/test/test_util');
const activeHandles = require('../src/activeHandles');

describe('metrics.activeHandles', function () {
  this.timeout(config.getTestTimeout());

  it('should export active handle count', () => {
    // @ts-ignore
    expect(activeHandles.currentPayload).to.equal(process._getActiveHandles().length);
  });

  // Skipping the test as we are not supporting node < 11.
  // We can unskip the test if we move away from the deprecated flag _getActiveHandles.
  // The new flag works better https://nodejs.org/api/process.html#processgetactiveresourcesinfo
  // refer https://github.com/instana/nodejs/pull/1387
  it.skip('should update handle count for a setTimeout', () => {
    const previousCount = activeHandles.currentPayload;
    const timeoutHandle = setTimeout(() => {}, 100);

    // TODO: getActiveResourcesInfo returns the correct value, but `_getActiveHandles` does not
    //       for v23.
    expect(activeHandles.currentPayload).to.equal(previousCount + 1);
    clearTimeout(timeoutHandle);
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
    /** @type {*} */
    let activeHandlesBefore;

    beforeEach(() => {
      activeHandlesBefore = activeHandles.currentPayload;
      server = net
        .createServer(function listener(c) {
          connections.push(c);
        })
        .listen(0, makeConnection);
    });

    afterEach(() => {
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
              // At least one handle should exist per client and one per connection, that's why we expect
              // (2 * maxClients) more handles than we had initially. However, other things are happening in the Node.js
              // runtime as well while this test is running, so it might actually happen that some of the unrelated
              // handles that existed initially have since been removed, which is why we allow for a little wiggle room
              // (-4 at the end). Without this wiggle room, this test is flaky.
              expect(activeHandles.currentPayload).to.be.at.least(activeHandlesBefore + 2 * maxClients - 4);
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
