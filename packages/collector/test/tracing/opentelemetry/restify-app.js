/*
 * (c) Copyright IBM Corp. 2023
 */

/* eslint-disable no-console */

'use strict';

const agentPort = process.env.INSTANA_AGENT_PORT;
const opentelemetryDisabled = process.env.INSTANA_DISABLE_USE_OPENTELEMETRY === 'true';

require('../../../src')({
  tracing: {
    useOpentelemetry: !opentelemetryDisabled
  }
});

const restify = require('restify');
const request = require('request-promise-native');
const _pg = require('pg');
const Pool = _pg.Pool;
const Client = _pg.Client;
const port = require('../../test_util/app-port')();
const logPrefix = `Restify App (${process.pid}):\t`;

const pool = new Pool({
  user: process.env.POSTGRES_USER,
  host: process.env.POSTGRES_HOST,
  database: process.env.POSTGRES_DB,
  password: process.env.POSTGRES_PASSWORD
});
const client = new Client({
  user: process.env.POSTGRES_USER,
  host: process.env.POSTGRES_HOST,
  database: process.env.POSTGRES_DB,
  password: process.env.POSTGRES_PASSWORD
});
client.connect();

const server = restify.createServer({
  name: 'myrestifyapp',
  version: '1.0.0'
});

server.use(restify.plugins.acceptParser(server.acceptable));
server.use(restify.plugins.queryParser());
server.use(restify.plugins.bodyParser());

server.get('/', (req, res, next) => {
  res.send();
  next();
});

server.get('/test', function (req, res, next) {
  log('Received /test request');

  pool.query('SELECT NOW()', (err, results) => {
    if (err) {
      log('Failed to execute select now query', err);
      return res.sendStatus(500);
    }
    // Execute another traced call to verify that we keep the tracing context.
    request(`http://127.0.0.1:${agentPort}`).then(() => {
      res.send(results);
      next();
    });
  });
});

server.listen(port, function () {
  log('%s listening at %s', server.name, server.url);
});

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
