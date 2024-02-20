/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

/* eslint-disable no-console */

require('../../..')({
  tracing: {
    useOpentelemetry: process.env.OTEL_ENABLED
  }
});
const express = require('express');
const app = express();
const port = require('../../test_util/app-port')();
const Connection = require('tedious').Connection;
const Request = require('tedious').Request;
const bodyParser = require('body-parser');
app.use(bodyParser.json());
// To obtain the credentials for the Azure SQL Database, you can find them in 1password. Search for
// "Team Node.js: Azure SQL credentials". The credentials are stored in the
// "nodejs-tracer-azure-sql-cred.json" file. Set the content to AZURE_SQL_CONFIG.

const azureConfig = process.env.AZURE_SQL_CONFIG ? JSON.parse(process.env.AZURE_SQL_CONFIG, 'utf-8') : null;
const config = {
  server: azureConfig && azureConfig.AZURE_SQL_SERVER ? azureConfig.AZURE_SQL_SERVER : process.env.AZURE_SQL_SERVER,
  authentication: {
    type: 'default',
    options: {
      userName:
        azureConfig && azureConfig.AZURE_SQL_USERNAME ? azureConfig.AZURE_SQL_USERNAME : process.env.AZURE_SQL_USERNAME,
      password: azureConfig && azureConfig.AZURE_SQL_PWD ? azureConfig.AZURE_SQL_PWD : process.env.AZURE_SQL_PWD
    }
  },
  options: {
    database:
      azureConfig && azureConfig.AZURE_SQL_DATABASE ? azureConfig.AZURE_SQL_DATABASE : process.env.AZURE_SQL_DATABASE
  }
};
let connected = false;
const connection = new Connection(config);

const retryDelay = 100;
const maxRetries = 2;
let currentRetry = 0;

const connectWithRetry = () => {
  connection.connect();
};

connection.on('connect', err => {
  if (err) {
    console.warn('Connection error', err);
    if (currentRetry < maxRetries) {
      currentRetry++;
      console.warn(`Retrying connection after ${retryDelay} seconds (Retry ${currentRetry}/${maxRetries})`);
      setTimeout(connectWithRetry, retryDelay * 100);
    } else {
      console.error('Maximum retries reached. Unable to establish a connection.');
    }
  } else {
    connected = true;
    console.warn('Connected to the database');
  }
});
connectWithRetry();

const executeStatement = (query, isBatch, res) => {
  const request = new Request(query, error => {
    if (error) {
      console.error('error on executeStatement.', error);
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
