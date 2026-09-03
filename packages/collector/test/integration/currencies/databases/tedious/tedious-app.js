/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

/* eslint-disable no-console */
require('@instana/collector')();
const express = require('express');
const path = require('path');
const port = require('@_local/collector/test/test_util/app-port')();
const tedious = require('tedious');

const tediousPath = require.resolve('tedious');
const expectedLocalPath = path.resolve(__dirname, 'node_modules', 'tedious');
if (!tediousPath.includes(expectedLocalPath)) {
  throw new Error(
    // eslint-disable-next-line max-len
    `Tediius must be loaded from local node_modules. Expected path containing: ${expectedLocalPath}, but got: ${tediousPath}`
  );
}

const Connection = tedious.Connection;
const Request = tedious.Request;
const bodyParser = require('body-parser');
const app = express();

app.use(bodyParser.json());

const dbHost = process.env.INSTANA_CONNECT_MSSQL_HOST || '127.0.0.1';
const dbUser = process.env.INSTANA_CONNECT_MSSQL_USER || 'sa';
const dbPassword = process.env.INSTANA_CONNECT_MSSQL_PW || 'stanCanHazMsSQL1';
const database = process.env.MSSQL_DB || 'master';

const isLocalHost = dbHost === 'localhost' || dbHost === '127.0.0.1';
const config = {
  server: dbHost,
  authentication: {
    type: 'default',
    options: {
      userName: dbUser,
      password: dbPassword
    }
  },
  options: {
    database,
    encrypt: true,
    trustServerCertificate: isLocalHost,
    connectTimeout: 30000
  }
};

let connected = false;
let connection;

const retryDelay = 2000;
const maxRetries = 10;
let currentRetry = 0;

function setupTable(cb) {
  const setupQuery = `
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='packages' and xtype='U')
    CREATE TABLE packages (id INT, name VARCHAR(50), version INT);
  `;
  const request = new Request(setupQuery, err => {
    if (err) {
      console.error('Error creating packages table:', err);
      return cb(err);
    }
    cb();
  });
  connection.execSql(request);
}

(function connectWithRetry() {
  if (connection) {
    connection.close();
  }
  connection = new Connection(config);
  connection.connect();

  connection.on('connect', err => {
    if (err) {
      console.warn('Connection error', err);
      if (currentRetry < maxRetries) {
        currentRetry++;
        console.warn(`Retrying connection after ${retryDelay} ms (Retry ${currentRetry}/${maxRetries})`);
        setTimeout(connectWithRetry, retryDelay);
      } else {
        console.error('Maximum retries reached. Unable to establish a connection.');
        connection.close();
      }
    } else {
      setupTable(setupErr => {
        if (setupErr) {
          console.error('Setup table failed', setupErr);
        } else {
          connected = true;
          console.warn('Connected to the database and table ready');
        }
      });
    }
  });
})();

const executeStatement = (query, isBatch, res) => {
  const request = new Request(query, error => {
    if (error) {
      console.error('Error on executeStatement.', error);
      res.status(500).send('Internal Server Error');
    }
  });

  request.on('requestCompleted', () => {
    res.send('OK');
  });

  if (isBatch) {
    connection.execSqlBatch(request);
  } else {
    connection.execSql(request);
  }
};

app.get('/', (req, res) => {
  if (!connected) {
    res.sendStatus(500);
  } else {
    res.sendStatus(200);
  }
});

app.get('/packages', (req, res) => {
  const query = 'SELECT * FROM packages';
  executeStatement(query, false, res);
});

app.delete('/packages', (req, res) => {
  const id = 11;
  const query = `DELETE FROM packages WHERE id = ${id}`;
  executeStatement(query, false, res);
});

app.post('/packages/batch', (req, res) => {
  const batchQuery = `
  INSERT INTO packages (id, name, version) VALUES (11, 'BatchPackage1', 1);
  INSERT INTO packages (id, name, version) VALUES (11, 'BatchPackage2', 2);
`;
  executeStatement(batchQuery, true, res);
});
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.warn(`Listening on port: ${port}`);
});
