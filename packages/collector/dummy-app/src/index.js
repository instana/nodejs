'use strict';

const config = require('./config');

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

const express = require('express');
const app = express();

app.get('/', (req, res) => {
  if (config.logRequests) {
    console.log('received request');
  }
  res.send('OK');
});

app.listen(config.appPort, () => {
  console.log('Listening on port', config.appPort);
});
