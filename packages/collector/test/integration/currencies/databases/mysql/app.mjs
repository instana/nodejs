/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2017
 */

/* eslint-disable no-console */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

const agentPort = process.env.INSTANA_AGENT_PORT;

import instanaFactory from '@instana/collector';
const instana = instanaFactory();
import mysql from 'mysql';
import getAppPort from '@_local/collector/test/test_util/app-port.js';
const port = getAppPort();

const driverModeEnvVar = process.env.DRIVER_MODE;
if (!driverModeEnvVar) {
  throw new Error(`Invalid configuration: ${driverModeEnvVar}.`);
}

const useCluster = driverModeEnvVar === 'mysql-cluster';

import bodyParser from 'body-parser';
import express from 'express';
import morgan from 'morgan';

const app = express();
const logPrefix = `Express / MySQL App (${process.pid}):\t`;
let pool;

if (useCluster) {
  const poolCluster = mysql.createPoolCluster({});
  poolCluster.add({
    connectionLimit: 5,
    host: process.env.INSTANA_CONNECT_MYSQL_HOST,
    user: process.env.INSTANA_CONNECT_MYSQL_USER,
    password: process.env.INSTANA_CONNECT_MYSQL_PW,
    database: process.env.INSTANA_CONNECT_MYSQL_DB
  });
  pool = poolCluster.of('*');
} else {
  pool = mysql.createPool({
    connectionLimit: 5,
    host: process.env.INSTANA_CONNECT_MYSQL_HOST,
    user: process.env.INSTANA_CONNECT_MYSQL_USER,
    password: process.env.INSTANA_CONNECT_MYSQL_PW,
    database: process.env.INSTANA_CONNECT_MYSQL_DB
  });
}

let connected = false;
const getConnection = () => {
  log('Trying to get connection for table creation');

  pool.getConnection((err, connection) => {
    log('Got connection for table creation', err);

    if (err) {
      log('Failed to get connection for table creation', err);
      setTimeout(getConnection, 1000);
      return;
    }

    connected = true;
    connection.query('CREATE TABLE random_values (value double);', queryError => {
      connection.release();

      if (queryError && queryError.code !== 'ER_TABLE_EXISTS_ERROR') {
        log('Failed to execute query for table creation', queryError);
        return;
      }

      log('Successfully created table');
    });
  });
};

getConnection();

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => {
  if (!connected) {
    return res.sendStatus(500);
  }
  res.sendStatus(200);
});

app.get('/values', (req, res) => {
  pool.query('SELECT value FROM random_values', (queryError, results) => {
    if (queryError) {
      log('Failed to execute query', queryError);
      res.sendStatus(500);
      return;
    }
    res.json(results.map(result => result.value));
  });
});

app.post('/values', (req, res) => {
  pool.getConnection((err, connection) => {
    if (err) {
      log('Failed to get connection', err);
      res.sendStatus(500);
      return;
    }

    connection.query('INSERT INTO random_values (value) VALUES (?)', [req.query.value], queryError => {
      connection.release();

      if (queryError) {
        log('Failed to execute query', queryError);
        res.sendStatus(500);
        return;
      }

      return res.json(instana.opentracing.getCurrentlyActiveInstanaSpanContext());
    });
  });
});

app.post('/valuesAndCall', (req, res) => {
  pool.getConnection((err, connection) => {
    if (err) {
      log('Failed to get connection', err);
      res.sendStatus(500);
      return;
    }

    connection.query('INSERT INTO random_values (value) VALUES (?)', [req.query.value], queryError => {
      connection.release();

      if (queryError) {
        log('Failed to execute query', queryError);
        res.sendStatus(500);
        return;
      }

      fetch(`http://127.0.0.1:${agentPort}/ping`)
        .then(response => response.json())
        .then(() => res.json(instana.opentracing.getCurrentlyActiveInstanaSpanContext()))
        .catch(fetchErr => {
          log('Fetch failed', fetchErr);
          res.sendStatus(500);
        });
    });
  });
});

app.listen(port, () => {
  log(`Listening on port: ${port} (driver: mysql, cluster: ${useCluster})`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
