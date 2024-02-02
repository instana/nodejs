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

function isPortTakenSync(port) {
  try {
    const server = net.createServer().listen(port);
    server.close();
    return false;
  } catch (error) {
    return true;
  }
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
      return findPort();
    }

    ports[port] = port;
  } catch (e) {
    return findPort();
  }

  return port;
};
