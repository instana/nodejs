/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2017
 */

/* eslint-disable no-console */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

const agentPort = process.env.INSTANA_AGENT_PORT;

const instana = require('@instana/collector')();

const accessFunction = process.env.USE_EXECUTE ? 'execute' : 'query';
const driverModeEnvVar = process.env.DRIVER_MODE;
if (!accessFunction || !driverModeEnvVar) {
  throw new Error(`Invalid configuration: ${accessFunction}, ${driverModeEnvVar}.`);
}

let driver;
let useCluster = false;
if (driverModeEnvVar === 'mysql') {
  driver = 'mysql';
} else if (driverModeEnvVar === 'mysql-cluster') {
  driver = 'mysql';
  useCluster = true;
} else if (driverModeEnvVar === 'mysql2') {
  driver = 'mysql2';
} else if (driverModeEnvVar === 'mysql2/promises') {
  driver = 'mysql2/promise';
}

const mysql = require(driver);

const bodyParser = require('body-parser');
const express = require('express');
const morgan = require('morgan');
const port = require('@_local/collector/test/test_util/app-port')();

const app = express();
const logPrefix = `Express / MySQL App (${process.pid}):\t`;
let pool;

if (useCluster) {
  const poolCluster = mysql.createPoolCluster({});
  poolCluster.add({
    connectionLimit: 5,
    host: process.env.INSTANA_CONNECT_MYSQL_HOST,
    user: process.env.INSTANA_CONNECT_MYSQL_USER,
    password: process.env.INSTANA_CONNECT_MYSQL_PW,
    database: process.env.INSTANA_CONNECT_MYSQL_DB
  });
  pool = poolCluster.of('*');
} else {
  pool = mysql.createPool({
    connectionLimit: 5,
    host: process.env.INSTANA_CONNECT_MYSQL_HOST,
    user: process.env.INSTANA_CONNECT_MYSQL_USER,
    password: process.env.INSTANA_CONNECT_MYSQL_PW,
    database: process.env.INSTANA_CONNECT_MYSQL_DB
  });
}

function wrapAccess(connection, query, optQueryParams, cb) {
  if (accessFunction === 'execute') {
    return wrapExecute(connection, query, optQueryParams, cb);
  } else {
    return wrapQuery(connection, query, optQueryParams, cb);
  }
}

function wrapQuery(connection, query, optQueryParams, cb) {
  if (driver === 'mysql2/promise') {
    connection
      .query(query, optQueryParams || null)
      .then(content => {
        const rows = content == null ? null : content[0];
        cb(null, rows);
      })
      .catch(err => {
        cb(err, null);
      });
  } else {
    connection.query(query, cb);
  }
}

function wrapExecute(connection, query, optQueryParams, cb) {
  if (driver === 'mysql2/promise') {
    connection
      .execute(query, optQueryParams || null)
      .then(content => {
        const rows = content == null ? null : content[0];
        cb(null, rows);
      })
      .catch(err => {
        cb(err, null);
      });
  } else {
    connection.execute(query, cb);
  }
}

let connected = false;
const getConnection = () => {
  log('Trying to get connection for table creation');

  if (driver === 'mysql2/promise') {
    pool
      .getConnection()
      .then(connection => {
        connected = true;
        wrapAccess(connection, 'CREATE TABLE random_values (value double);', null, () => {
          connection.release();
          log('Successfully created table');
        });
      })
      .catch(err => {
        log('Failed to get connection', err);
        setTimeout(getConnection, 1000);
      });

    return;
  }

  pool.getConnection((err, connection) => {
    log('Got connection for table creation', err);

    if (err) {
      log('Failed to get connection for table creation', err);
      setTimeout(getConnection, 1000);
      return;
    }

    connected = true;
    wrapAccess(connection, 'CREATE TABLE random_values (value double);', null, queryError => {
      connection.release();

      if (queryError && queryError.code !== 'ER_TABLE_EXISTS_ERROR') {
        log('Failed to execute query for table creation', queryError);
        return;
      }

      log('Successfully created table');
    });
  });
};

getConnection();

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => {
  if (!connected) {
    return res.sendStatus(500);
  }
  res.sendStatus(200);
});

app.get('/values', (req, res) => {
  if (driver === 'mysql2/promise') {
    fetchValuesWithPromises(req, res);
  } else {
    fetchValues(req, res);
  }
});

app.post('/values', (req, res) => {
  if (driver === 'mysql2/promise') {
    insertValuesWithPromises(req, res);
  } else {
    insertValues(req, res);
  }
});

app.post('/valuesAndCall', (req, res) => {
  if (driver === 'mysql2/promise') {
    insertValuesWithPromisesAndCall(req, res);
  } else {
    insertValues(req, res, cb => {
      fetch(`http://127.0.0.1:${agentPort}/ping`)
        .then(response => response.json())
        .then(data => cb(null, data))
        .catch(err => cb(err, null));
    });
  }
});

app.post('/error', (req, res) => {
  if (driver === 'mysql2/promise') {
    triggerErrorWithPromises(req, res);
  } else {
    triggerError(req, res);
  }
});

app.listen(port, () => {
  log(
    `Listening on port: ${process.env.APP_PORT} (driver: ${driver}, access: ${accessFunction}, cluster: ${useCluster})`
  );
});

function fetchValues(req, res) {
  wrapAccess(pool, 'SELECT value FROM random_values', null, (queryError, results) => {
    if (queryError) {
      log('Failed to execute query', queryError);
      res.sendStatus(500);
      return;
    }
    res.json(results.map(result => result.value));
  });
}

function fetchValuesWithPromises(req, res) {
  pool
    .getConnection()
    .then(connection => {
      wrapAccess(connection, 'SELECT value FROM random_values', null, (queryError, results) => {
        if (queryError) {
          log('Failed to execute query', queryError);
          res.sendStatus(500);
          return;
        }
        res.json(results.map(result => result.value));
      });
    })
    .catch(err => {
      log('Failed to get connection', err);
      res.sendStatus(500);
    });
}

function insertValues(req, res, extraCallback) {
  pool.getConnection((err, connection) => {
    if (err) {
      log('Failed to get connection', err);
      res.sendStatus(500);
      return;
    }

    connection[accessFunction]('INSERT INTO random_values (value) VALUES (?)', [req.query.value], queryError => {
      connection.release();

      if (queryError) {
        log('Failed to execute query', queryError);
        res.sendStatus(500);
        return;
      }

      if (extraCallback) {
        extraCallback(() => res.json(instana.opentracing.getCurrentlyActiveInstanaSpanContext()));
      } else {
        return res.json(instana.opentracing.getCurrentlyActiveInstanaSpanContext());
      }
    });
  });
}

function insertValuesWithPromises(req, res) {
  pool
    .getConnection()
    .then(connection => {
      wrapAccess(connection, 'INSERT INTO random_values (value) VALUES (?)', [req.query.value], queryError => {
        if (queryError != null) {
          log('Failed to execute query', queryError);
          res.sendStatus(500);
        } else {
          connection.release();
          res.sendStatus(200);
        }
      });
    })
    .catch(err => {
      log('Failed to get connection', err);
      res.sendStatus(500);
    });
}

function insertValuesWithPromisesAndCall(req, res) {
  let connection;
  pool
    .getConnection()
    .then(_connection => {
      connection = _connection;
      return connection[accessFunction]('INSERT INTO random_values (value) VALUES (?)', [req.query.value]);
    })
    .then(result => (result ? result[0] : null))
    .then(() => {
      connection.release();
    })
    .then(() => fetch(`http://127.0.0.1:${agentPort}/ping`))
    .then(response => response.json())
    .then(() => {
      res.json(instana.opentracing.getCurrentlyActiveInstanaSpanContext());
    })
    .catch(err => {
      log('Could not process request.', err);
      res.sendStatus(500);
    });
}

function triggerError(req, res) {
  pool.getConnection((err, connection) => {
    if (err) {
      log('Failed to get connection', err);
      res.sendStatus(500);
      return;
    }

    connection[accessFunction]('SELECT * FROM non_existent_table', queryError => {
      connection.release();

      if (queryError) {
        log('Expected error occurred', queryError);
        res.sendStatus(500);
        return;
      }

      res.sendStatus(200);
    });
  });
}

function triggerErrorWithPromises(req, res) {
  pool
    .getConnection()
    .then(connection => {
      wrapAccess(connection, 'SELECT * FROM non_existent_table', null, queryError => {
        connection.release();

        if (queryError) {
          log('Expected error occurred', queryError);
          res.sendStatus(500);
        } else {
          res.sendStatus(200);
        }
      });
    })
    .catch(err => {
      log('Failed to get connection', err);
      res.sendStatus(500);
    });
}

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
