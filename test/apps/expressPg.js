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

var _pg = require('pg');
var Pool = _pg.Pool;
var express = require('express');
var morgan = require('morgan');
var bodyParser = require('body-parser');

var app = express();
var logPrefix = 'Express / Postgres App (' + process.pid + '):\t';
var pool = new Pool({
  user: process.env.POSTGRES_USER,
  host: process.env.POSTGRES_HOST,
  database: process.env.POSTGRES_DB,
  password: process.env.POSTGRES_PASSWORD
});

var createTableQuery = 'CREATE TABLE IF NOT EXISTS users(id serial primary key,' +
                       ' name varchar(40) NOT NULL, email varchar(40) NOT NULL)';

pool.query(createTableQuery, function(err) {
  if (err) {
    log('Failed create table query', err);
  }
});

if (process.env.WITH_STDOUT) {
  app.use(morgan(logPrefix + ':method :url :status'));
}

app.use(bodyParser.json());

app.get('/', function(req, res) {
  res.sendStatus(200);
});

app.get('/select-now', function(req, res) {
  pool.query('SELECT NOW()', function(err, results) {
    if (err) {
      log('Failed to execute query', err);
      res.sendStatus(500);
      return;
    }
    res.json(results);
  });
});

app.get('/insert-and-select', function(req, res) {
  var text = 'INSERT INTO users(name, email) VALUES($1, $2) RETURNING *';
  var values = ['beaker', 'beaker@muppets.com'];

  pool.query(text, values, function(err, results) {
    if (err) {
      log('Failed to execute query', err);
      res.sendStatus(500);
    } else {
      res.json(results);
    }
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
