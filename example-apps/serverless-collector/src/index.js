/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const path = require('path');
const MODE = process.env.MODE || 'npm';
const APP_PORT = process.env.APP_PORT || 9191;
const DOWNSTREAM_URL = process.env.DOWNSTREAM_URL;

let packageToRequire = path.join(__dirname, '..', '..', '..', 'packages', 'serverless-collector');

if (MODE === 'npm') {
  packageToRequire = '@instana/serverless-collector';
}

require(packageToRequire);

const cors = require('cors');

const express = require('express-v4');
const app = express();

app.use(cors());

app.get('/trace', (req, res) => {
  console.log('Received request /trace');

  res.set('Timing-Allow-Origin', '*');

  if (!DOWNSTREAM_URL) {
    res.send('OK');
  } else {
    fetch(DOWNSTREAM_URL)
      .then(downstreamResponse => {
        res.json(downstreamResponse);
      })
      .catch(err => {
        console.error(`downstream request finished with error (${new Date()})`);
        console.error(err);
        res.status(502).send(err.stack);
      });
  }
});

app.listen(APP_PORT, () => {
  console.log(`serverless-collector app started on port ${APP_PORT} in mode ${MODE}`);
});
