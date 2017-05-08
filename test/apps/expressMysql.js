/* eslint-disable no-console */

'use strict';

require('../../')({
  agentPort: process.env.AGENT_PORT,
  level: 'info',
  tracing: {
    enabled: process.env.TRACING_ENABLED === 'true',
    forceTransmissionStartingAt: 1
  }
});

var mysql = require('mysql');
var bodyParser = require('body-parser');
var express = require('express');
var morgan = require('morgan');

var app = express();
var logPrefix = 'Express / MySQL App (' + process.pid + '):\t';
var pool = mysql.createPool({
  connectionLimit: 5,
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PW,
  database: process.env.MYSQL_DB
});

pool.getConnection(function(err, connection) {
  if (err) {
    log('Failed to get connection for table creation', err);
    return;
  }

  connection.query('CREATE TABLE random_values (value double);', function(queryError) {
    connection.release();

    if (queryError && queryError.code !== 'ER_TABLE_EXISTS_ERROR') {
      log('Failed to execute query for table creation', queryError);
      return;
    }

    log('Successfully created table');
  });
});

if (process.env.WITH_STDOUT) {
  app.use(morgan(logPrefix + ':method :url :status'));
}

app.use(bodyParser.json());


app.get('/', function(req, res) {
  res.sendStatus(200);
});

app.get('/values', function(req, res) {
  pool.query('SELECT value FROM random_values', function(queryError, results) {
    if (queryError) {
      log('Failed to execute query', queryError);
      res.sendStatus(500);
      return;
    }

    res.json(results.map(function(result) {
      return result.value;
    }));
  });
});

app.post('/values', function(req, res) {
  pool.getConnection(function(err, connection) {
    if (err) {
      log('Failed to get connection', err);
      res.sendStatus(500);
      return;
    }

    connection.query('INSERT INTO random_values (value) VALUES (?)', [req.query.value], function(queryError) {
      connection.release();

      if (queryError) {
        log('Failed to execute query', queryError);
        res.sendStatus(500);
        return;
      }

      res.sendStatus(200);
    });
  });
});

app.listen(process.env.APP_PORT, function() {
  log('Listening on port: ' + process.env.APP_PORT);
});

function log() {
  var args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
