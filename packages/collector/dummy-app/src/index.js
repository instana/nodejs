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

const downstreamUrl = process.env.DOWNSTREAM_URL;

const express = require('express');
const requestPromise = require('request-promise');

const app = express();

app.get('/', (req, res) => {
  if (config.logRequests) {
    console.log(`received request (${new Date()})`);
  }

  if (!downstreamUrl) {
    res.send('OK');
  } else {
    requestPromise('http://localhost:8000/v1/helloworld')
      .then(downstreamRespons => {
        if (config.logRequests) {
          console.log(`downstream request successful (${new Date()})`);
        }
        res.json(downstreamRespons);
      })
      .catch(err => {
        console.error(`downstream request finished with error (${new Date()})`);
        console.error(err);
        res.status(502).send(err.stack);
      });
  }
});

app.get('/json', (req, res) => {
  if (config.logRequests) {
    console.log(`received request to /json (${new Date()})`);
  }
  res.json({
    firstName: 'Juan',
    lastName: 'Pérez',
    city: 'Barcelona',
    state: 'ES-CT'
  });
});

app.listen(config.appPort, () => {
  console.log('Listening on port', config.appPort);
});
