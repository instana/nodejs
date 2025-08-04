/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

const config = require('./config');
const path = require('path');

let packageToRequire = path.join(__dirname, '..', '..', '..', 'packages/collector');
if (config.mode === 'npm') {
  packageToRequire = '@instana/collector';
  console.log('Using NPM');
}

if (config.collectorEnabled) {
  console.log(`enabling @instana/collector (requiring ${packageToRequire})`);
  require(packageToRequire)({
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
const app = express();

app.get('/', (req, res) => {
  if (config.logRequests) {
    console.log(`received request (${new Date()})`);
  }

  if (!downstreamUrl) {
    res.send('OK');
  } else {
    fetch('http://localhost:8000/v1/helloworld')
      .then(downstreamResponse => {
        if (config.logRequests) {
          console.log(`downstream request successful (${new Date()})`);
        }
        res.json(downstreamResponse);
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
