/* eslint-disable no-console */

'use strict';

var config = require('./config');
var cluster = require('cluster');


if (config.sensor.enabled) {
  require('instana-nodejs-sensor')({
    level: 'info',
    agentPort: config.sensor.agentPort,
    tracing: {
      enabled: config.sensor.tracing,
      stackTraceLength: config.sensor.stackTraceLength
    }
  });
}

require('heapdump');

if (cluster.isMaster && config.app.workers > 1) {
  initMaster();
} else {
  initWorker();
}


function initMaster() {
  console.log('Master ' + process.pid + ' is running');

  for (var i = 0; i < config.app.workers; i++) {
    cluster.fork();
  }

  cluster.on('exit', function(worker) {
    console.log('worker ' + worker.process.pid + ' died');
  });
}


function initWorker() {
  console.log('Starting worker ' + process.pid);

  require('./app').init(function() {
    console.log('Worker ' + process.pid + ' started');
  });
}
