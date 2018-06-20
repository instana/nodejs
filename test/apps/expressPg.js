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
var Client = _pg.Client;
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
var client = new Client({
  user: process.env.POSTGRES_USER,
  host: process.env.POSTGRES_HOST,
  database: process.env.POSTGRES_DB,
  password: process.env.POSTGRES_PASSWORD
});
client.connect();

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
      log('Failed to execute select now query', err);
      res.sendStatus(500);
      return;
    }
    res.json(results);
  });
});

app.get('/pool-string-insert', function(req, res) {
  var insert = 'INSERT INTO users(name, email) VALUES($1, $2) RETURNING *';
  var values = ['beaker', 'beaker@muppets.com'];

  pool.query(insert, values, function(err, results) {
    if (err) {
      log('Failed to execute pool insert', err);
      res.sendStatus(500);
    }
    res.json(results);
  });
});

app.get('/pool-config-select', function(req, res) {
  var query = {
    text: 'SELECT name, email FROM users',
  };

  pool.query(query, function(err, results) {
    if (err) {
      log('Failed to execute pool config insert', err);
      res.sendStatus(500);
    }
    res.json(results);
  });
});

app.get('/pool-config-select-promise', function(req, res) {
  var query = {
    text: 'INSERT INTO users(name, email) VALUES($1, $2) RETURNING *',
    values: ['beaker', 'beaker@muppets.com'],
  };

  pool.query(query)
    .then(function(results) {
      res.json(results);
    })
    .catch(function(e) {
      return log(e.stack);
    });
});

app.get('/client-string-insert', function(req, res) {
  var insert = 'INSERT INTO users(name, email) VALUES($1, $2) RETURNING *';
  var values = ['beaker', 'beaker@muppets.com'];

  client.query(insert, values, function(err, results) {
    if (err) {
      log('Failed to execute client insert', err);
      res.sendStatus(500);
    }
    res.json(results);
  });
});

app.get('/client-config-select', function(req, res) {
  var query = {
    text: 'SELECT name, email FROM users',
  };

  client.query(query, function(err, results) {
    if (err) {
      log('Failed to execute client select', err);
      res.sendStatus(500);
    }
    res.json(results);
  });
});

app.get('/table-doesnt-exist', function(req, res) {
  pool.query('SELECT name, email FROM nonexistanttable')
    .then(function(r) {
      res.json(r);
    })
    .catch(function(e) {
      res.status(500).json(e);
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
