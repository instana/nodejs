/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

/*
const fs = require('fs');
const path = require('path');
const minPort = 10000;
const pkg = require('../../package.json');
const portRanges = {};
const portDiff = 1000;
let myPortRange;
*/

const ports = {};
const { execSync } = require('child_process');

// Ports blocked by undici/fetch (subset of Chromium unsafe ports in range 3000-9000)
const BLOCKED_PORTS = new Set([3659, 4045, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6697]);

/*
const net = require('net');
// const deasync = require('deasync');
// const fibers = require('fibers');

function busyWait(milliseconds) {
  const start = Date.now();
  while (Date.now() - start < milliseconds) {
    // Busy-waiting
    for (let i = 0; i < 1000000; i++) {
      // This loop keeps CPU busy
    }
  }
}

function isPortTakenSync(port) {
  const server = net.createServer().listen(port);

  let isTaken = false;
  let isClosed = false;

  server.on('error', err => {
    isTaken = true;

    if (err.code !== 'EADDRINUSE') {
      // eslint-disable-next-line no-console
      console.log('[portfinder] error', err);
    }
  });

  server.on('listening', () => {
    server.close();
    isClosed = true;
  });

  const startTime = Date.now();
  const timeout = 1000;

  while (!isClosed && !isTaken && Date.now() - startTime < timeout) {
    console.log('BLOCKING, WAITING FOR PORT', isClosed, isTaken);
    busyWait(1000);
    // eslint-disable-next-line no-undef
    // Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);

    // sleep.sleep(1);
    // deasync.sleep(100);
  }

  return isTaken || Date.now() - startTime >= timeout;
}

let i = 0;
Object.keys(pkg.scripts).forEach(scriptName => {
  if (scriptName.indexOf('test:ci:') !== -1) {
    portRanges[scriptName] = {
      start: minPort + i * portDiff + 1,
      end: minPort + (i + 1) * portDiff
    };

    i += 1;
  }
});

const pkgs = fs.readdirSync(path.join(__dirname, '..', '..', '..'));
pkgs.forEach(p => {
  portRanges[p] = {
    start: minPort + i * portDiff + 1,
    end: minPort + (i + 1) * portDiff
  };

  i += 1;
});

Object.keys(portRanges).every(key => {
  if (process.env.LERNA_PACKAGE_NAME === '@instana/collector' && key.indexOf(process.env.npm_lifecycle_event) !== -1) {
    myPortRange = portRanges[key];
    return false;
  } else if (process.env.LERNA_PACKAGE_NAME.indexOf(key) !== -1) {
    myPortRange = portRanges[key];
  }

  // continue
  return true;
});

// console.log(portRanges);

function getRandomNumberBetween(x, y) {
  return Math.floor(Math.random() * (y - x + 1)) + x;
}

const findFreePort = opts => {
  const port = getRandomNumberBetween(opts.start, opts.end);
  if (isPortTakenSync(port)) {
    return findFreePort(opts);
  }

  return port;
};
*/

// const callerPath = require('caller-path');
module.exports = function findPort(minPort) {
  let port;

  try {
    const min = 3000;
    const max = 9000;
    const randomNumber = Math.floor(Math.random() * (max - min + 1)) + min;

    port = execSync('node portfinder-async.js', {
      cwd: __dirname,
      env: Object.assign({ MIN_PORT: minPort || randomNumber }, process.env)
    })
      .toString()
      .trim()
      // eslint-disable-next-line no-control-regex
      .replace(/\x1B\[\d+m/g, '')
      .replace(/\D/g, '');

    port = Number(port);

    if (ports[port] || BLOCKED_PORTS.has(port)) {
      // eslint-disable-next-line no-console
      if (ports[port]) console.log('Port is already taken by this process', port);
      return findPort(port + Math.round(Math.random(100) * 100));
    }

    ports[port] = port;
  } catch (err) {
    // If the test is manually interrupted, exit gracefully.
    if (err.signal === 'SIGINT') {
      // eslint-disable-next-line no-console
      console.log('Test interrupted manually (SIGINT). Skipping port search.');
      return null;
    }
    // eslint-disable-next-line no-console
    console.log('Error when looking for port', err);
    return findPort();
  }

  return port;
};
