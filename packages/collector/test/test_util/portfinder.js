/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const fs = require('fs');
const path = require('path');
const ports = {};
const minPort = 10000;
const pkg = require('../../package.json');
const portRanges = {};
const portDiff = 1000;
let myPortRange;

const net = require('net');
const deasync = require('deasync');

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
    deasync.runLoopOnce();
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

module.exports = function findPort() {
  let port;

  try {
    port = findFreePort({ start: myPortRange.start, end: myPortRange.end });

    if (ports[port]) {
      // eslint-disable-next-line no-console
      console.log('Port is already taken by this process', port);
      return findPort();
    }

    // eslint-disable-next-line no-console
    // console.log('Using port', port);

    ports[port] = port;
  } catch (e) {
    return findPort();
  }

  return port;
};
