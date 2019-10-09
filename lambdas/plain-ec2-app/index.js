'use strict';

// eslint-disable-next-line import/no-unresolved
require('@instana/collector')();

const bodyParser = require('body-parser');
const express = require('express');
const fs = require('fs');
const morgan = require('morgan');
const path = require('path');
const pg = require('pg');

const pgHost = process.env.RDS_HOSTNAME || 'localhost';
const pgPort = process.env.RDS_PORT || '5432';
const pgDatabase = process.env.RDS_DB_NAME || 'lambdademo';
const pgUser = process.env.RDS_USERNAME || 'postgres';
const pgPassword = process.env.RDS_PASSWORD;
const port = process.env.APP_PORT || 2808;

const logPrefix = `Audit Log Service (${process.pid}):\t`;

log(
  `Using PG config: ${pgHost}:${pgPort}/${pgDatabase}, user ${pgUser}, ${
    pgPassword ? 'a password has been provided.' : 'no password has been provided!'
  }`
);

const pool = new pg.Pool({
  host: pgHost,
  port: pgPort,
  database: pgDatabase,
  user: pgUser,
  password: pgPassword
});

const app = express()
  .use(morgan(`${logPrefix}:method :url :status`))
  .use(bodyParser.json());

app.get('/', (req, res) => {
  res.sendStatus(200);
});

app.post('/audit-log', (req, res) => {
  const message = req.body.message || 'some random audit log message';
  return pool
    .query('INSERT INTO audit_log(message) VALUES($1) RETURNING *', [message])
    .then(() => res.sendStatus(201))
    .catch(e => {
      log('Could not write audit log: ', e);
      res.sendStatus(500);
    });
});

// HTTPS:
require('https')
  .createServer(
    {
      key: fs.readFileSync(path.join(__dirname, 'key')),
      cert: fs.readFileSync(path.join(__dirname, 'cert'))
    },
    app
  )
  .listen(port, () => {
    log(`Listening for HTTPS traffic on port: ${port}`);
  });

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
