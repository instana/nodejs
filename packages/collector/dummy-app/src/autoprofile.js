/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

const config = require('./config');

let packageToRequire = '../..';
if (config.mode === 'npm') {
  packageToRequire = '@instana/collector';
}

console.log(`enabling @instana/collector (requiring ${packageToRequire})`);
require(packageToRequire)({ autoProfile: true });

const fs = require('fs');
const http = require('http');

function cpuWork(usage, duration) {
  const usageTimer = setInterval(() => {
    for (let i = 0; i < usage * 300000; i++) {
      Math.random();
    }
  }, 1000);

  if (duration) {
    setTimeout(() => {
      clearInterval(usageTimer);
    }, duration * 1000);
  }
}

function simulateCpu() {
  cpuWork(5);

  setInterval(() => {
    cpuWork(25, 240);
  }, 1200 * 1000);
}

function simulateMemLeak() {
  let mem1 = [];
  let n = 0;

  // 30 min
  setInterval(() => {
    if (n++ > 1800) {
      mem1 = [];
      n = 0;
    }

    for (let i = 0; i < 5000; i++) {
      const obj1 = { v: Math.random() };
      mem1.push(obj1);
    }
  }, 1000);

  // 5 sec
  setInterval(() => {
    const mem2 = [];
    for (let i = 0; i < 500; i++) {
      const obj2 = { v: Math.random() };
      mem2.push(obj2);
    }
  }, 5000);
}

function simulateHttp() {
  setInterval(() => {
    const options = {
      host: '127.0.0.1',
      port: 5005
    };

    const req = http.get(options, () => {});

    req.on('error', function (err) {
      console.log(err.message);
    });
  }, 1000);
}

const server = http.createServer((req, res) => {
  fs.readFile('/tmp', () => {
    setTimeout(() => {
      cpuWork(10, 2);

      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/plain');
      res.end('Hello World\n');
    }, 500);
  });
});

server.listen(5005, '127.0.0.1', () => {
  console.log('App running');

  simulateCpu();
  simulateMemLeak();
  simulateHttp();
});
