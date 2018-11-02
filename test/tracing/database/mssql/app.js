/* eslint-disable no-console */

'use strict';

require('../../../../')({
  agentPort: process.env.AGENT_PORT,
  level: 'info',
  tracing: {
    forceTransmissionStartingAt: 1
  }
});

var bodyParser = require('body-parser');
var express = require('express');
var morgan = require('morgan');
var sql = require('mssql');
var devNull = require('dev-null');

var pool;
var app = express();
var logPrefix = 'Express / MSSQL App (' + process.pid + '):\t';

sql.on('error', function(err) {
  log(err);
});

var dbHost = process.env.MSSQL_HOST ? process.env.MSSQL_HOST : '127.0.0.1';
var dbPort = process.env.MSSQL_PORT ? parseInt(process.env.MSSQL_PORT, 10) : 1433;
var dbUrl = dbHost + ':' + dbPort;
var dbUser = process.env.MSSQL_USER ? process.env.MSSQL_USER : 'sa';
var dbPassword = process.env.MSSQL_PW ? process.env.MSSQL_PW : 'stanCanHazMsSQL1';
var initConnectString = 'mssql://' + dbUser + ':' + dbPassword + '@' + dbUrl + '/tempdb';
var dbName = 'nodejssensor';
var preparedStatementGlobal = new sql.PreparedStatement();
var ready = false;

sql
  .connect(initConnectString)
  .then(function() {
    return new sql.Request().query(
      "IF EXISTS (SELECT * FROM sys.databases WHERE name = N'" + dbName + "') DROP DATABASE " + dbName
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
      user: dbUser,
      password: dbPassword,
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
    return new sql.Request().batch(
      'CREATE PROCEDURE testProcedure' +
        '    @username nvarchar(40)' +
        'AS' +
        '    SET NOCOUNT ON;' +
        '    SELECT name, email' +
        '    FROM UserTable' +
        '    WHERE name = @username;'
    );
  })
  .then(function() {
    preparedStatementGlobal = new sql.PreparedStatement();
    preparedStatementGlobal.input('username', sql.NVarChar(40));
    preparedStatementGlobal.input('email', sql.NVarChar(40));
    return preparedStatementGlobal.prepare('INSERT INTO UserTable (name, email) VALUES (@username, @email)');
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

app.get('/select-static', function(req, res) {
  sql.query('SELECT GETDATE()', function(err, results) {
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
  new sql.Request()
    .query('SELECT GETDATE()')
    .then(function(results) {
      res.json(results.recordset);
    })
    .catch(function(err) {
      log('Failed to execute select query.', err);
      res.status(500).json(err);
    });
});

app.get('/error-promise', function(req, res) {
  new sql.Request()
    .query('SELECT name, email FROM non_existing_table')
    .then(function(results) {
      log('Failed to fail on error.');
      res.json(results.recordset);
    })
    .catch(function(err) {
      res.status(500).json(err);
    });
});

app.post('/insert', function(req, res) {
  var insert = "INSERT INTO UserTable (name, email) VALUES (N'gaius', N'gaius@julius.com')";
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

app.post('/insert-prepared-callback', function(req, res) {
  var ps = new sql.PreparedStatement();
  ps.input('username', sql.NVarChar(40));
  ps.input('email', sql.NVarChar(40));
  ps.prepare('INSERT INTO UserTable (name, email) VALUES (@username, @email)', function(err1) {
    if (err1) {
      log('Failed to prepare statement.', err1);
      return res.status(500).json(err1);
    }
    ps.execute(
      {
        username: 'tiberius',
        email: 'tiberius@claudius.com'
      },
      function(err2, results) {
        if (err2) {
          log('Failed to execute prepared insert.', err2);
          return res.status(500).json(err2);
        }
        ps.unprepare(function(err3) {
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

app.post('/insert-prepared-promise', function(req, res) {
  preparedStatementGlobal
    .execute({
      username: 'caligula',
      email: 'caligula@julioclaudian.com'
    })
    .then(function(results) {
      res.json(results);
    })
    .catch(function(err) {
      log('Failed to process prepared statement.', err);
      return res.status(500).json(err);
    });
});

app.post('/insert-prepared-error-callback', function(req, res) {
  var ps = new sql.PreparedStatement();
  ps.input('username', sql.NVarChar(40));
  ps.input('email', sql.NVarChar(40));
  ps.prepare('INSERT INTO UserTable (name, email) VALUES (@username, @email)', function(err1) {
    if (err1) {
      log('Failed to prepare statement.', err1);
      return res.status(500).json(err1);
    }
    ps.execute(
      {
        username: 'claudius',
        email: 'claudius@claudius.com_lets_make_this_longer_than_40_chars'
      },
      function(err2, results) {
        ps.unprepare(function(err3) {
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

app.post('/insert-prepared-error-promise', function(req, res) {
  var ps = new sql.PreparedStatement();
  ps.input('username', sql.NVarChar(40));
  ps.input('email', sql.NVarChar(40));
  var results;
  return ps
    .prepare('INSERT INTO UserTable (name, email) VALUES (@username, @email)')
    .then(function() {
      return ps.execute({
        username: 'nero',
        email: 'nero@julioclaudian.com_lets_make_this_longer_than_40_chars'
      });
    })
    .then(function(_results) {
      results = _results;
      return ps.unprepare();
    })
    .then(function() {
      log('Failed to fail prepared statement.');
      res.json(results);
    })
    .catch(function(err) {
      ps.unprepare();
      return res.status(500).json(err);
    });
});

app.get('/select-by-name/:username', function(req, res) {
  var ps = new sql.PreparedStatement();
  ps.input('username', sql.NVarChar(40));
  var results;
  return ps
    .prepare('SELECT name, email FROM UserTable WHERE name=@username')
    .then(function() {
      return ps.execute({ username: req.params.username });
    })
    .then(function(_results) {
      results = _results;
      return ps.unprepare();
    })
    .then(function() {
      res.json(results.recordset[0].email);
    })
    .catch(function(err) {
      log('Failed to process prepared select statement.', err);
      return res.status(500).json(err);
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
  var customPool = new sql.ConnectionPool(
    {
      user: dbUser,
      password: dbPassword,
      server: dbHost,
      port: dbPort,
      database: dbName
    },
    function(err1) {
      if (err1) {
        log('Failed to create a connection pool.', err1);
        return res.status(500).json(err1);
      }
      customPool.request().query('SELECT 1 AS NUMBER', function(err2, results) {
        if (err2) {
          log('Failed to execute select.', err2);
          return res.status(500).json(err2);
        }
        return res.json(results.recordset);
      });
    }
  );
});

app.post('/transaction-callback', function(req, res) {
  var transaction = new sql.Transaction();
  transaction.begin(function(err1) {
    if (err1) {
      log('Failed to begin transaction.', err1);
      return res.status(500).json(err1);
    }
    new sql.Request(transaction)
      .input('username', sql.NVarChar(40), 'vespasian')
      .input('email', sql.NVarChar(40), 'vespasian@flavius.com')
      .query('INSERT INTO UserTable (name, email) VALUES (@username, @email)', function(err2) {
        if (err2) {
          log('Failed to execute insert.', err2);
          return res.status(500).json(err2);
        }
        new sql.Request(transaction).query("SELECT name, email FROM UserTable WHERE name=N'vespasian'", function(
          err3,
          results
        ) {
          if (err3) {
            log('Failed to execute insert.', err3);
            return res.status(500).json(err3);
          }
          transaction.commit(function(err4) {
            if (err4) {
              log('Failed to commit transaction.', err4);
              return res.status(500).json(err4);
            }
            res.json(results.recordset[0].email);
          });
        });
      });
  });
});

app.post('/transaction-promise', function(req, res) {
  var transaction = new sql.Transaction();
  var results;
  transaction
    .begin()
    .then(function() {
      return new sql.Request(transaction)
        .input('username', sql.NVarChar(40), 'titus')
        .input('email', sql.NVarChar(40), 'titus@flavius.com')
        .query('INSERT INTO UserTable (name, email) VALUES (@username, @email)');
    })
    .then(function() {
      return new sql.Request(transaction).query("SELECT name, email FROM UserTable WHERE name=N'titus'");
    })
    .then(function(_results) {
      results = _results;
    })
    .then(function() {
      return transaction.commit();
    })
    .then(function() {
      res.json(results.recordset[0].email);
    })
    .catch(function(err) {
      log('Failed to process transaction.', err);
    });
});

app.get('/stored-procedure-callback', function(req, res) {
  new sql.Request().input('username', sql.NVarChar(40), 'augustus').execute('testProcedure', function(err, results) {
    if (err) {
      log('Failed to execute stored procedure.', err);
      return res.status(500).json(err);
    }
    res.json(results);
  });
});

app.get('/streaming', function(req, res) {
  var request = new sql.Request();
  var rows = [];
  var errors = [];
  request.stream = true;
  request.query('SELECT name, email FROM UserTable');

  request.on('row', function(row) {
    rows.push(row);
  });

  request.on('error', function(err) {
    errors.push(err);
  });

  request.on('done', function() {
    res.json({
      rows: rows,
      errors: errors
    });
  });
});

app.get('/pipe', function(req, res) {
  var request = new sql.Request();
  var stream = devNull();
  request.pipe(stream);
  request.query('SELECT name, email FROM UserTable');

  stream.on('error', function(err) {
    console.log('PIPE ERR', err);
  });
  stream.on('finish', function() {
    console.log('PIPE FINISH');
    res.end();
  });
});

app.get('/batch-callback', function(req, res) {
  new sql.Request().batch('SELECT GETDATE()', function(err, results) {
    if (err) {
      log('Failed to execute batch.', err);
      return res.status(500).json(err);
    }
    res.json(results.recordset);
  });
});

app.get('/batch-promise', function(req, res) {
  new sql.Request()
    .batch('SELECT GETDATE()')
    .then(function(results) {
      res.json(results.recordset);
    })
    .catch(function(err) {
      log('Failed to execute batch.', err);
      return res.status(500).json(err);
    });
});

app.get('/bulk', function(req, res) {
  var table = new sql.Table('AnotherUserTable');
  table.create = true;
  table.columns.add('name', sql.NVarChar(40), { nullable: true });
  table.columns.add('email', sql.NVarChar(40), { nullable: true });
  table.rows.add('Domitian', 'domitian@flavius.com');
  table.rows.add('Nerva', 'nerva@nerva.com');
  table.rows.add('Trajan ', 'trajan@nerva.com');
  new sql.Request().bulk(table, function(err, results) {
    if (err) {
      log('Failed to execute bulk operation.', err);
      return res.status(500).json(err);
    }
    res.json(results);
  });
});

app.get('/cancel', function(req, res) {
  var request = new sql.Request();
  request.query("WAITFOR DELAY '00:00:05'; SELECT 1 as NUMBER", function(err, results) {
    if (err) {
      console.log(err);
      return res.json(err);
    }
    log('Failed to cancel query.');
    res.json(results.recordset);
  });
  request.cancel();
});

app.listen(process.env.APP_PORT, function() {
  log('Listening on port: ' + process.env.APP_PORT);
});

function log() {
  var args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
