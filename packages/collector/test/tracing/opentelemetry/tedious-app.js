/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

/* eslint-disable no-console */
require('../../..')({
  tracing: {
    useOpentelemetry: true
  }
});
const express = require('express');
const app = express();
const port = require('../../test_util/app-port')();
const Connection = require('tedious').Connection;
const Request = require('tedious').Request;
const bodyParser = require('body-parser');
app.use(bodyParser.json());

const config = {
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

const executeStatement = (query, res) => {
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

    const columnsData = [];

    request.on('row', columns => {
      const rowData = {};
      columns.forEach(column => {
        rowData[column.metadata.colName] = column.value;
      });
      columnsData.push(rowData);
    });

    request.on('requestCompleted', () => {
      res.json({ columns: columnsData });
      connection.close();
    });

    connection.execSql(request);
  });

  connection.connect();
};

app.get('/', (req, res) => {
  res.sendStatus(200);
});

app.get('/packages', (req, res) => {
  const query = 'SELECT * FROM packages';
  executeStatement(query, res);
});

app.listen(port, () => {
  console.warn(`Listening on port: ${port}`);
});
