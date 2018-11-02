/* eslint-disable no-console */

'use strict';

var agentPort = process.env.AGENT_PORT;

var instana = require('../../../../');
instana({
  agentPort: agentPort,
  level: 'info',
  tracing: {
    enabled: process.env.TRACING_ENABLED === 'true',
    forceTransmissionStartingAt: 1
  }
});

var mysql;
if (process.env.MYSQL_2_DRIVER === 'true') {
  if (process.env.MYSQL_2_WITH_PROMISES === 'true') {
    mysql = require('mysql2/promise');
  } else {
    mysql = require('mysql2');
  }
} else {
  mysql = require('mysql');
}

var request = require('request-promise');
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

function wrapQuery(connection, query, optQueryParams, cb) {
  if (process.env.MYSQL_2_WITH_PROMISES === 'true') {
    connection
      .query(query, optQueryParams || null)
      .then(function(content) {
        var rows = content == null ? null : content[0];
        cb(null, rows);
      })
      .catch(function(err) {
        cb(err, null);
      });
  } else {
    connection.query(query, cb);
  }
}

pool.getConnection(function(err, connection) {
  if (err) {
    log('Failed to get connection for table creation', err);
    return;
  }
  wrapQuery(connection, 'CREATE TABLE random_values (value double);', null, function(queryError) {
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
  if (process.env.MYSQL_2_WITH_PROMISES === 'true') {
    fetchValuesWithPromises(req, res);
  } else {
    fetchValues(req, res);
  }
});

app.post('/values', function(req, res) {
  if (process.env.MYSQL_2_WITH_PROMISES === 'true') {
    insertValuesWithPromises(req, res);
  } else {
    insertValues(req, res);
  }
});

app.post('/valuesAndCall', function(req, res) {
  if (process.env.MYSQL_2_WITH_PROMISES === 'true') {
    insertValuesWithPromisesAndCall(req, res);
  } else {
    insertValues(req, res, function(cb) {
      request('http://127.0.0.1:' + agentPort, cb);
    });
  }
});

app.listen(process.env.APP_PORT, function() {
  log('Listening on port: ' + process.env.APP_PORT);
});

function fetchValues(req, res) {
  wrapQuery(pool, 'SELECT value FROM random_values', null, function(queryError, results) {
    if (queryError) {
      log('Failed to execute query', queryError);
      res.sendStatus(500);
      return;
    }
    res.json(
      results.map(function(result) {
        return result.value;
      })
    );
  });
}

function fetchValuesWithPromises(req, res) {
  pool
    .getConnection()
    .then(function(connection) {
      wrapQuery(connection, 'SELECT value FROM random_values', null, function(queryError, results) {
        if (queryError) {
          log('Failed to execute query', queryError);
          res.sendStatus(500);
          return;
        }
        res.json(
          results.map(function(result) {
            return result.value;
          })
        );
      });
    })
    .catch(function(err) {
      log('Failed to get connection', err);
      res.sendStatus(500);
    });
}

function insertValues(req, res, extraCallback) {
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

      if (extraCallback) {
        extraCallback(function() {
          return res.json(instana.opentracing.getCurrentlyActiveInstanaSpanContext());
        });
      } else {
        return res.json(instana.opentracing.getCurrentlyActiveInstanaSpanContext());
      }
    });
  });
}

function insertValuesWithPromises(req, res) {
  pool
    .getConnection()
    .then(function(connection) {
      wrapQuery(connection, 'INSERT INTO random_values (value) VALUES (?)', [req.query.value], function(queryError) {
        if (queryError != null) {
          log('Failed to execute query', queryError);
          res.sendStatus(500);
        } else {
          connection.release();
          res.sendStatus(200);
        }
      });
    })
    .catch(function(err) {
      log('Failed to get connection', err);
      res.sendStatus(500);
    });
}

function insertValuesWithPromisesAndCall(req, res) {
  var connection;
  pool
    .getConnection()
    .then(function(_connection) {
      connection = _connection;
      return connection.query('INSERT INTO random_values (value) VALUES (?)', [req.query.value]);
    })
    .then(function(result) {
      return result ? result[0] : null;
    })
    .then(function() {
      connection.release();
    })
    .then(function() {
      return request('http://127.0.0.1:' + agentPort);
    })
    .then(function() {
      res.json(instana.opentracing.getCurrentlyActiveInstanaSpanContext());
    })
    .catch(function(err) {
      log('Could not process request.', err);
      res.sendStatus(500);
    });
}

function log() {
  var args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
