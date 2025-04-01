/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

/* eslint-disable no-console */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('./mockVersion');
require('@instana/core/test/test_util/loadExpressV4');

require('../../../..')();

const bodyParser = require('body-parser');
const express = require('express');
const morgan = require('morgan');
const sql = require('mssql');
const devNull = require('dev-null');
const port = require('../../../test_util/app-port')();

const { delay, isCI } = require('@instana/core/test/test_util');

let pool;
const app = express();
const logPrefix = `Express / MSSQL App (${process.pid}):\t`;

sql.on('error', err => {
  log(err);
});

const dbHost = process.env.MSSQL_HOST ? process.env.MSSQL_HOST : 'localhost';
const dbPort = process.env.MSSQL_PORT ? parseInt(process.env.MSSQL_PORT, 10) : 1433;
const dbUser = process.env.MSSQL_USER ? process.env.MSSQL_USER : 'sa';
const dbPassword = process.env.MSSQL_PW ? process.env.MSSQL_PW : 'stanCanHazMsSQL1';

const connectConfigBase = {
  user: dbUser,
  password: dbPassword,
  server: dbHost,
  port: dbPort,
  trustServerCertificate: true
};

const initConnectConfig = Object.assign({}, connectConfigBase);
initConnectConfig.database = 'tempdb';

const dbName = 'nodejscollector';
const connectConfig = Object.assign({}, connectConfigBase);
connectConfig.database = dbName;

let preparedStatementGlobal = new sql.PreparedStatement();
let ready = false;

async function connect() {
  await sql.connect(initConnectConfig);
  await new sql.Request().query(
    `IF EXISTS (SELECT * FROM sys.databases WHERE name = N'${dbName}') DROP DATABASE ${dbName}`
  );
  await new sql.Request().query(`CREATE DATABASE ${dbName}`);
  await sql.close();

  pool = await sql.connect(connectConfig);
  await new sql.Request().query(
    'CREATE TABLE UserTable (id INT IDENTITY(1,1), name VARCHAR(40) NOT NULL, email VARCHAR(40) NOT NULL)'
  );
  await new sql.Request().batch(
    'CREATE PROCEDURE testProcedure' +
      '    @username nvarchar(40)' +
      'AS' +
      '    SET NOCOUNT ON;' +
      '    SELECT name, email' +
      '    FROM UserTable' +
      '    WHERE name = @username;'
  );
  preparedStatementGlobal = new sql.PreparedStatement();
  preparedStatementGlobal.input('username', sql.NVarChar(40));
  preparedStatementGlobal.input('email', sql.NVarChar(40));
  await preparedStatementGlobal.prepare('INSERT INTO UserTable (name, email) VALUES (@username, @email)');
  ready = true;
}

async function connectWithRetry() {
  if (isCI()) {
    const maxRetries = 10;
    let retries = 1;
    for (; retries <= maxRetries; retries++) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await connect();
        break;
      } catch (err) {
        if (retries >= maxRetries) {
          log(`Failed to create database or table or failed to connect after ${retries} retries.`, err.message);
          throw err;
        } else {
          log(
            `Failed to create database or table or failed to connect in retry ${retries}, will retry in a bit.`,
            err.message
          );
          // eslint-disable-next-line no-await-in-loop
          await delay(6000);
        }
      }
    }
  } else {
    try {
      await connect();
    } catch (err) {
      log('Failed to create database or table or failed to connect.', err);
    }
  }
}

connectWithRetry();

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => {
  function checkIfReady() {
    if (ready) {
      res.sendStatus(200);
    } else {
      setTimeout(checkIfReady, 10);
    }
  }
  setTimeout(checkIfReady, 10);
});

app.get('/select-getdate', (req, res) => {
  new sql.Request().query('SELECT GETDATE()', (err, results) => {
    if (err) {
      log('Failed to execute select query.', err);
      return res.status(500).json(err);
    }
    res.json(results.recordset);
  });
});

app.get('/select-static', (req, res) => {
  sql.query('SELECT GETDATE()', (err, results) => {
    if (err) {
      log('Failed to execute select query.', err);
      return res.status(500).json(err);
    }
    res.json(results.recordset);
  });
});

app.get('/error-callback', (req, res) => {
  new sql.Request().query('SELECT name, email FROM non_existing_table', (err, results) => {
    if (err) {
      return res.status(500).json(err);
    }
    log('Failed to fail on error.', err);
    return res.json(results.recordset);
  });
});

app.get('/select-promise', (req, res) => {
  new sql.Request()
    .query('SELECT GETDATE()')
    .then(results => {
      res.json(results.recordset);
    })
    .catch(err => {
      log('Failed to execute select query.', err);
      res.status(500).json(err);
    });
});

app.get('/error-promise', (req, res) => {
  new sql.Request()
    .query('SELECT name, email FROM non_existing_table')
    .then(results => {
      log('Failed to fail on error.');
      res.json(results.recordset);
    })
    .catch(err => {
      res.status(500).json(err);
    });
});

app.post('/insert', (req, res) => {
  const insert = "INSERT INTO UserTable (name, email) VALUES (N'gaius', N'gaius@julius.com')";
  new sql.Request().query(insert, (err, results) => {
    if (err) {
      log('Failed to execute insert.', err);
      return res.status(500).json(err);
    }
    res.json(results);
  });
});

app.post('/insert-params', (req, res) => {
  const insert = 'INSERT INTO UserTable (name, email) VALUES (@username, @email)';
  new sql.Request()
    .input('username', sql.NVarChar(40), 'augustus')
    .input('email', sql.NVarChar(40), 'augustus@julius.com')
    .query(insert, (err, results) => {
      if (err) {
        log('Failed to execute insert.', err);
        return res.status(500).json(err);
      }
      res.json(results);
    });
});

app.get('/select', (req, res) => {
  new sql.Request().query('SELECT name, email FROM UserTable', (err, results) => {
    if (err) {
      log('Failed to execute select.', err);
      return res.status(500).json(err);
    }
    res.json(results.recordset);
  });
});

app.post('/insert-prepared-callback', (req, res) => {
  const ps = new sql.PreparedStatement();
  ps.input('username', sql.NVarChar(40));
  ps.input('email', sql.NVarChar(40));
  ps.prepare('INSERT INTO UserTable (name, email) VALUES (@username, @email)', err1 => {
    if (err1) {
      log('Failed to prepare statement.', err1);
      return res.status(500).json(err1);
    }
    ps.execute(
      {
        username: 'tiberius',
        email: 'tiberius@claudius.com'
      },
      (err2, results) => {
        if (err2) {
          log('Failed to execute prepared insert.', err2);
          return res.status(500).json(err2);
        }
        ps.unprepare(err3 => {
          if (err3) {
            log('Failed to unprepare statement.', err3);
            return res.status(500).json(err3);
          }
          res.json(results);
        });
      }
    );
  });
});

app.post('/insert-prepared-promise', (req, res) => {
  preparedStatementGlobal
    .execute({
      username: 'caligula',
      email: 'caligula@julioclaudian.com'
    })
    .then(results => {
      res.json(results);
    })
    .catch(err => {
      log('Failed to process prepared statement.', err);
      return res.status(500).json(err);
    });
});

app.post('/insert-prepared-error-callback', (req, res) => {
  const ps = new sql.PreparedStatement();
  ps.input('username', sql.NVarChar(40));
  ps.input('email', sql.NVarChar(40));
  ps.prepare('INSERT INTO UserTable (name, email) VALUES (@username, @email)', err1 => {
    if (err1) {
      log('Failed to prepare statement.', err1);
      return res.status(500).json(err1);
    }
    ps.execute(
      {
        username: 'claudius',
        email: 'claudius@claudius.com_lets_make_this_longer_than_40_chars'
      },
      (err2, results) => {
        ps.unprepare(err3 => {
          if (err3) {
            log('Failed to unprepare statement.', err3);
            return res.status(500).json(err3);
          }
          if (!err2) {
            log('Failed to fail on execute');
            return res.json(results);
          } else {
            res.status(500).json(err2);
          }
        });
      }
    );
  });
});

app.post('/insert-prepared-error-promise', (req, res) => {
  const ps = new sql.PreparedStatement();
  ps.input('username', sql.NVarChar(40));
  ps.input('email', sql.NVarChar(40));
  let results;
  return ps
    .prepare('INSERT INTO UserTable (name, email) VALUES (@username, @email)')
    .then(() =>
      ps.execute({
        username: 'nero',
        email: 'nero@julioclaudian.com_lets_make_this_longer_than_40_chars'
      })
    )
    .then(_results => {
      results = _results;
      return ps.unprepare();
    })
    .then(() => {
      log('Failed to fail prepared statement.');
      res.json(results);
    })
    .catch(err => {
      ps.unprepare();
      return res.status(500).json(err);
    });
});

app.get('/select-by-name/:username', (req, res) => {
  const ps = new sql.PreparedStatement();
  ps.input('username', sql.NVarChar(40));
  let results;
  return ps
    .prepare('SELECT name, email FROM UserTable WHERE name=@username')
    .then(() => ps.execute({ username: req.params.username }))
    .then(_results => {
      results = _results;
      return ps.unprepare();
    })
    .then(() => {
      res.json(results.recordset[0].email);
    })
    .catch(err => {
      log('Failed to process prepared select statement.', err);
      return res.status(500).json(err);
    });
});

app.get('/select-standard-pool', (req, res) => {
  pool.request().query('SELECT 1 AS NUMBER', (err, results) => {
    if (err) {
      log('Failed to execute select.', err);
      return res.status(500).json(err);
    }
    res.json(results.recordset);
  });
});

app.get('/select-custom-pool', (req, res) => {
  const customPool = new sql.ConnectionPool(connectConfig, err1 => {
    if (err1) {
      log('Failed to create a connection pool.', err1);
      return res.status(500).json(err1);
    }
    customPool.request().query('SELECT 1 AS NUMBER', (err2, results) => {
      if (err2) {
        log('Failed to execute select.', err2);
        return res.status(500).json(err2);
      }
      return res.json(results.recordset);
    });
  });
});

app.post('/transaction-callback', (req, res) => {
  const transaction = new sql.Transaction();
  transaction.begin(err1 => {
    if (err1) {
      log('Failed to begin transaction.', err1);
      return res.status(500).json(err1);
    }
    new sql.Request(transaction)
      .input('username', sql.NVarChar(40), 'vespasian')
      .input('email', sql.NVarChar(40), 'vespasian@flavius.com')
      .query('INSERT INTO UserTable (name, email) VALUES (@username, @email)', err2 => {
        if (err2) {
          log('Failed to execute insert.', err2);
          return res.status(500).json(err2);
        }
        new sql.Request(transaction).query(
          "SELECT name, email FROM UserTable WHERE name=N'vespasian'",
          (err3, results) => {
            if (err3) {
              log('Failed to execute insert.', err3);
              return res.status(500).json(err3);
            }
            transaction.commit(err4 => {
              if (err4) {
                log('Failed to commit transaction.', err4);
                return res.status(500).json(err4);
              }
              res.json(results.recordset[0].email);
            });
          }
        );
      });
  });
});

app.post('/transaction-promise', (req, res) => {
  const transaction = new sql.Transaction();
  let results;
  transaction
    .begin()
    .then(() =>
      new sql.Request(transaction)
        .input('username', sql.NVarChar(40), 'titus')
        .input('email', sql.NVarChar(40), 'titus@flavius.com')
        .query('INSERT INTO UserTable (name, email) VALUES (@username, @email)')
    )
    .then(() => new sql.Request(transaction).query("SELECT name, email FROM UserTable WHERE name=N'titus'"))
    .then(_results => {
      results = _results;
    })
    .then(() => transaction.commit())
    .then(() => {
      res.json(results.recordset[0].email);
    })
    .catch(err => {
      log('Failed to process transaction.', err);
    });
});

app.get('/stored-procedure-callback', (req, res) => {
  new sql.Request().input('username', sql.NVarChar(40), 'augustus').execute('testProcedure', (err, results) => {
    if (err) {
      log('Failed to execute stored procedure.', err);
      return res.status(500).json(err);
    }
    res.json(results);
  });
});

app.get('/streaming', (req, res) => {
  const request = new sql.Request();
  const rows = [];
  const errors = [];
  request.stream = true;
  request.query('SELECT name, email FROM UserTable');

  request.on('row', row => {
    rows.push(row);
  });

  request.on('error', err => {
    errors.push(err);
  });

  request.on('done', () => {
    res.json({
      rows,
      errors
    });
  });
});

app.get('/pipe', (req, res) => {
  const request = new sql.Request();
  const stream = devNull();
  request.pipe(stream);
  request.query('SELECT name, email FROM UserTable');

  stream.on('error', err => {
    console.log('PIPE ERR', err);
  });
  stream.on('finish', () => {
    res.end();
  });
});

app.get('/batch-callback', (req, res) => {
  new sql.Request().batch('SELECT GETDATE()', (err, results) => {
    if (err) {
      log('Failed to execute batch.', err);
      return res.status(500).json(err);
    }
    res.json(results.recordset);
  });
});

app.get('/batch-promise', (req, res) => {
  new sql.Request()
    .batch('SELECT GETDATE()')
    .then(results => {
      res.json(results.recordset);
    })
    .catch(err => {
      log('Failed to execute batch.', err);
      return res.status(500).json(err);
    });
});

app.get('/bulk', (req, res) => {
  const table = new sql.Table('AnotherUserTable');
  table.create = true;
  table.columns.add('name', sql.NVarChar(40), { nullable: true });
  table.columns.add('email', sql.NVarChar(40), { nullable: true });
  table.rows.add('Domitian', 'domitian@flavius.com');
  table.rows.add('Nerva', 'nerva@nerva.com');
  table.rows.add('Trajan ', 'trajan@nerva.com');
  new sql.Request().bulk(table, (err, results) => {
    if (err) {
      log('Failed to execute bulk operation.', err);
      return res.status(500).json(err);
    }
    res.json(results);
  });
});

app.get('/cancel', (req, res) => {
  const request = new sql.Request();
  request.query("WAITFOR DELAY '00:00:05'; SELECT 1 as NUMBER", (err, results) => {
    if (err) {
      console.log(err);
      return res.json(err);
    }
    log('Failed to cancel query.');
    res.json(results.recordset);
  });
  request.cancel();
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
