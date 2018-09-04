/* eslint-disable no-console */

'use strict';

require('../../../')({
  agentPort: process.env.AGENT_PORT,
  level: 'info',
  tracing: {
    forceTransmissionStartingAt: 1
  }
});

// TODO:
// UPDATE MONGOOSE and MONGODB first!!
// Streaming
// Pools
// Stored Procedures
// using configuration
// pipe, batch, bulk, cancel
// Transactions
// prepared statements

var sql = require('mssql');
var express = require('express');
var morgan = require('morgan');
var bodyParser = require('body-parser');

// var pool;
var app = express();
var logPrefix = 'Express / MSSQL App (' + process.pid + '):\t';


sql.on('error', function(err) {
  log(err);
});


var initDbUrl = 'mssql://sa:' + process.env.MSSQL_PW + '@' + process.env.MSSQL_URL + '/tempdb';
var dbName = 'nodejssensor';
var dbUrl = 'mssql://sa:' + process.env.MSSQL_PW + '@' + process.env.MSSQL_URL + '/' + dbName;
var ready = false;


sql
  .connect(initDbUrl)
  .then(function() {
    return new sql.Request().query(
      'IF EXISTS (SELECT * FROM sys.databases WHERE name = N\'' + dbName + '\') DROP DATABASE ' + dbName
    );
  })
  .then(function() {
    return new sql.Request().query('CREATE DATABASE ' + dbName);
  })
  .then(function() {
    return sql.close();
  })
  .then(function() {
    return sql.connect(dbUrl);
  })
  .then(function(/* _pool */) {
    // pool = _pool;
    return new sql.Request().query(
      'CREATE TABLE UserTable (id INT IDENTITY(1,1), name VARCHAR(40) NOT NULL, email VARCHAR(40) NOT NULL)'
    );
  })
  .then(function() {
    ready = true;
  })
  .catch(function(initErr) {
    log('Failed to create database or table or failed to connect.', initErr);
  });


if (process.env.WITH_STDOUT) {
  app.use(morgan(logPrefix + ':method :url :status'));
}


app.use(bodyParser.json());


app.get('/', function(req, res) {
  function checkIfReady() {
    if (ready) {
      res.sendStatus(200);
    } else {
      setTimeout(checkIfReady, 10);
    }
  }
  setTimeout(checkIfReady, 10);
});


app.get('/select-getdate', function(req, res) {
  new sql.Request().query('SELECT GETDATE()', function(err, results) {
    if (err) {
      log('Failed to execute select now query.', err);
      return res.sendStatus(500).json(err);
    }
    res.json(results.recordset);
  });
});


app.post('/insert', function(req, res) {
  var insert = 'INSERT INTO UserTable (name, email) VALUES (N\'gaius\', N\'gaius@julius.com\')';
  new sql.Request().query(insert, function(err, results) {
    if (err) {
      log('Failed to execute insert.', err);
      return res.sendStatus(500).json(err);
    }
    res.json(results);
  });
});


app.post('/insert-params', function(req, res) {
  var insert = 'INSERT INTO UserTable (name, email) VALUES (@username, @email)';
  new sql.Request()
    .input('username', sql.NVarChar(40), 'augustus')
    .input('email', sql.NVarChar(40), 'augustus@julius.com')
    .query(insert, function(err, results) {
    if (err) {
      log('Failed to execute insert.', err);
      return res.sendStatus(500).json(err);
    }
    res.json(results);
  });
});


app.get('/select', function(req, res) {
  new sql.Request().query('SELECT name, email FROM UserTable', function(err, results) {
    if (err) {
      log('Failed to execute select.', err);
      return res.sendStatus(500).json(err);
    }
    res.json(results.recordset);
  });
});


app.get('/table-doesnt-exist', function(req, res) {
  new sql.Request().query('SELECT name, email FROM non_existing_table')
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
