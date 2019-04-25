'use strict';

var config = require('./config');

if (config.collectorEnabled) {
  console.log('enabling @instana/collector');
  require('../..')({
    level: 'info',
    agentPort: config.agentPort,
    tracing: {
      enabled: config.tracingEnabled
    }
  });
} else {
  console.log('NOT enabling @instana/collector');
}

var express = require('express');
var app = express();

app.get('/', function(req, res) {
  if (config.logRequests) {
    console.log('received request');
  }
  res.send('OK');
});

app.listen(config.appPort, function() {
  console.log('Listening on port', config.appPort);
});
