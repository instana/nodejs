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
const fs = require('fs');
const path = require('path');
const { isCI } = require('@instana/core/test/test_util');
const port = require('../../test_util/app-port')();
const tedious = require('tedious');

// Verify that tedious is loaded from the local node_modules
const tediousPath = require.resolve('tedious');
const expectedLocalPath = path.resolve(__dirname, 'node_modules', 'tedious');
if (!tediousPath.includes(expectedLocalPath)) {
  throw new Error(
    // eslint-disable-next-line max-len
    `tedious must be loaded from local node_modules. Expected path containing: ${expectedLocalPath}, but got: ${tediousPath}`
  );
}

const Connection = tedious.Connection;
const Request = tedious.Request;
const bodyParser = require('body-parser');
const app = express();

app.use(bodyParser.json());

// Locally:
// To obtain the credentials for the Azure SQL Database, you can find them in 1password. Search for
// "Team Node.js: Azure SQL credentials", download the file and copy this to your CMD line:
// export AZURE_SQL_CONFIG=~/Downloads/nodejs-tracer-azure-sql-server.json
if (!isCI() && !process.env.AZURE_SQL_CONFIG) {
  throw new Error('Please set the env variable `AZURE_SQL_CONFIG`.');
}

const azureConfig = process.env.AZURE_SQL_CONFIG
  ? JSON.parse(fs.readFileSync(process.env.AZURE_SQL_CONFIG, 'utf-8'))
  : null;

const config = {
  server: azureConfig?.AZURE_SQL_SERVER || process.env.AZURE_SQL_SERVER,
  authentication: {
    type: 'default',
    options: {
      userName: azureConfig?.AZURE_SQL_USERNAME || process.env.AZURE_SQL_USERNAME,
      password: azureConfig?.AZURE_SQL_PWD || process.env.AZURE_SQL_PWD
    }
  },
  options: {
    database: azureConfig?.AZURE_SQL_DATABASE || process.env.AZURE_SQL_DATABASE,
    connectTimeout: 30000
  }
};

let connected = false;
let connection;

const retryDelay = 30000;
const maxRetries = 2;
let currentRetry = 0;

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
      connected = true;
      console.warn('Connected to the database');
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
