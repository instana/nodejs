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
// Keeping trace context
// Streaming
// Stored Procedures
// pipe, batch, bulk, cancel
// Transactions
// prepared statements

var sql = require('mssql');
var express = require('express');
var morgan = require('morgan');
var bodyParser = require('body-parser');

var pool;
var app = express();
var logPrefix = 'Express / MSSQL App (' + process.pid + '):\t';


sql.on('error', function(err) {
  log(err);
});


var dbHost = process.env.MSSQL_HOST ? process.env.MSSQL_HOST : '127.0.0.1';
var dbPort = process.env.MSSQL_PORT ? parseInt(process.env.MSSQL_PORT, 10) : 1433;
var dbUrl = dbHost + ':' + dbPort;
var initConnectString = 'mssql://sa:' + process.env.MSSQL_PW + '@' + dbUrl + '/tempdb';
var dbName = 'nodejssensor';
var ready = false;


sql
  .connect(initConnectString)
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
    return sql.connect({
      user: 'sa',
      password: process.env.MSSQL_PW,
      server: dbHost,
      port: dbPort,
      database: dbName
    });
  })
  .then(function(_pool) {
    pool = _pool;
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
      log('Failed to execute select query.', err);
      return res.status(500).json(err);
    }
    res.json(results.recordset);
  });
});


app.get('/error-callback', function(req, res) {
  new sql.Request().query('SELECT name, email FROM non_existing_table', function(err, results) {
    if (err) {
      return res.status(500).json(err);
    }
    log('Failed to fail on error.', err);
    return res.json(results.recordset);
  });
});


app.get('/select-promise', function(req, res) {
  new sql.Request().query('SELECT GETDATE()')
    .then(function(results) {
      res.json(results.recordset);
    })
    .catch(function(err) {
      log('Failed to execute select query.', err);
      res.status(500).json(err);
    });
});


app.get('/error-promise', function(req, res) {
  new sql.Request().query('SELECT name, email FROM non_existing_table')
    .then(function(results) {
      log('Failed to fail on error.');
      res.json(results.recordset);
    })
    .catch(function(err) {
      res.status(500).json(err);
    });
});


app.post('/insert', function(req, res) {
  var insert = 'INSERT INTO UserTable (name, email) VALUES (N\'gaius\', N\'gaius@julius.com\')';
  new sql.Request().query(insert, function(err, results) {
    if (err) {
      log('Failed to execute insert.', err);
      return res.status(500).json(err);
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
      return res.status(500).json(err);
    }
    res.json(results);
  });
});


app.get('/select', function(req, res) {
  new sql.Request().query('SELECT name, email FROM UserTable', function(err, results) {
    if (err) {
      log('Failed to execute select.', err);
      return res.status(500).json(err);
    }
    res.json(results.recordset);
  });
});


app.get('/select-standard-pool', function(req, res) {
  pool.request().query('SELECT 1 AS NUMBER', function(err, results) {
    if (err) {
      log('Failed to execute select.', err);
      return res.status(500).json(err);
    }
    res.json(results.recordset);
  });
});


app.get('/select-custom-pool', function(req, res) {
  var customPool = new sql.ConnectionPool({
    user: 'sa',
    password: process.env.MSSQL_PW,
    server: dbHost,
    port: dbPort,
    database: dbName
  }, function(err1) {
    if (err1) {
      log('Failed to create a connection pool.', err1);
      return res.status(500).json(err1);
    }
    customPool
      .request()
      .query('SELECT 1 AS NUMBER', function(err2, results) {
        if (err2) {
          log('Failed to execute select.', err2);
          return res.status(500).json(err2);
        }
        return res.json(results.recordset);
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
