/*
 * (c) Copyright IBM Corp. 2025
 */

/* eslint-disable no-console */

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

import express from 'express';
import fs from 'fs';
import bodyParser from 'body-parser';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import testUtil from '../../../../core/test/test_util/index.js';
import getAppPort from '../../test_util/app-port.js';
const port = getAppPort();
const isCI = testUtil.isCI;
import tedious from 'tedious';

// Verify that tedious is loaded from the local node_modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);
const tediousPath = require.resolve('tedious');
const expectedLocalPath = resolve(__dirname, 'node_modules', 'tedious');
if (!tediousPath.includes(expectedLocalPath)) {
  throw new Error(
    `tedious must be loaded from local node_modules. Expected path containing: ${expectedLocalPath}, but got: ${tediousPath}`
  );
}

const Connection = tedious.Connection;
const Request = tedious.Request;
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
