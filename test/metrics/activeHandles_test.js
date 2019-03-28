/* global Promise */
/* eslint-env mocha */

'use strict';

var expect = require('chai').expect;
var semver = require('semver');
var net = require('net');

var activeHandles = require('../../src/metrics/activeHandles');
var utils = require('../utils');

describe('metrics.activeHandles', function() {
  beforeEach(function() {
    activeHandles.activate();
  });

  afterEach(function() {
    activeHandles.deactivate();
  });

  it('should export active handle count', function() {
    expect(activeHandles.currentPayload).to.equal(process._getActiveHandles().length);
  });

  it('should update handle count for a setTimeout', function() {
    if (semver.satisfies(process.versions.node, '>=11')) {
      // skip test beginning with Node.js 11, I suspect commit https://github.com/nodejs/node/commit/ccc3bb73db
      // (PR https://github.com/nodejs/node/pull/24264) to have broken this test. Seems timeouts do no longer add to
      // active handles. See 'with net client/server' for a test case that verifies this metric also for
      // Node.js >= 11.x.
      return;
    }

    var previousCount = activeHandles.currentPayload;
    var timeoutHandle = setTimeout(function() {}, 100);
    expect(activeHandles.currentPayload).to.equal(previousCount + 1);
    clearTimeout(timeoutHandle);
  });

  describe('with net client/server', function() {
    /* eslint-disable max-len */
    // Inspired by
    // https://github.com/nodejs/node/blob/01422769775a2ce7dfef8aa6dbda2d326f002e13/test/parallel/test-process-getactivehandles.js

    var maxClients = 8;
    var server;
    var connections = [];
    var clients = [];
    var activeHandlesBefore;

    beforeEach(function() {
      activeHandlesBefore = activeHandles.currentPayload;
      server = net
        .createServer(function listener(c) {
          connections.push(c);
        })
        .listen(0, makeConnection);
    });

    afterEach(function() {
      clients.forEach(function(client) {
        client.destroy();
      });
      connections.forEach(function(connection) {
        connection.end();
      });
      server.close();
    });

    it('should update handle count for net client and connection', function() {
      return utils.retry(function() {
        return new Promise(function(resolve, reject) {
          if (clients.length >= maxClients) {
            // At least one handle should exist per client and one per connection, that's why we expect
            // (2 * maxClients) more handles than we had initially. However, other things are happening in the Node.js
            // runtime as well while this test is running, so it might actually happen that some of the unrelated
            // handles that existed initially have since been removed, which is why we allow for a little wiggle room
            // (-2 at the end). Without this wiggle room, this test is flaky.
            expect(activeHandles.currentPayload).to.be.at.least(activeHandlesBefore + 2 * maxClients - 2);
            resolve();
          } else {
            reject(new Error('Still waiting for more clients to connect.'));
          }
        });
      });
    });

    function makeConnection() {
      if (clients.length >= maxClients) {
        return;
      }
      net.connect(
        server.address().port,
        function connected() {
          clientConnected(this);
          makeConnection();
        }
      );
    }

    function clientConnected(client) {
      clients.push(client);
    }
  });
});
