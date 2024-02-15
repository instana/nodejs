/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

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
let config;
// To obtain the credentials for the Azure SQL Database, you can find them in 1password. Search for
// "Team Node.js: Azure SQL credentials". The credentials are stored in the
// "nodejs-tracer-azure-sql-cred.txt" file. Set the content to AZURE_SQL_CONFIG.

const azureConfig = process.env.AZURE_SQL_CONFIG ? JSON.parse(process.env.AZURE_SQL_CONFIG) : null;
if (azureConfig) {
  config = azureConfig;
} else {
  config = {
    server: process.env.AZURE_SQL_SERVER,
    authentication: {
      type: 'default',
      options: {
        userName: process.env.AZURE_SQL_USERNAME,
        password: process.env.AZURE_SQL_PWD
      }
    },
    options: {
      database: process.env.AZURE_SQL_DATABASE
    }
  };
}

const executeStatement = (query, isBatch, res) => {
  const connection = new Connection(config);

  connection.on('connect', err => {
    if (err) {
      res.status(500).send('Internal Server Error');
      return;
    }

    const request = new Request(query, error => {
      if (error) {
        res.status(500).send('Internal Server Error');
      }
    });

    request.on('requestCompleted', () => {
      res.send('OK');
      connection.close();
    });

    if (isBatch) {
      connection.execSqlBatch(request);
    } else {
      connection.execSql(request);
    }
  });

  connection.connect();
};

app.get('/', (req, res) => {
  res.sendStatus(200);
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
