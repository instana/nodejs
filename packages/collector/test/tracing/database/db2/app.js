/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

require('../../../..')();

/* eslint-disable no-console */
const bodyParser = require('body-parser');
const express = require('express');
const fs = require('fs');
const morgan = require('morgan');
const ibmdb = require('ibm_db');
const app = express();
const port = process.env.APP_PORT || 3322;
const logPrefix = `DB2 App (${process.pid}):\t`;
const DB2_NAME = process.env.DB2_NAME;
let connStr = 'HOSTNAME=localhost;UID=node;PWD=nodepw;PORT=58885;PROTOCOL=TCPIP';

/**
 * We are unable to start a DB2 container on circleci, because db2 needs privileged permissions.
 * Extractor type "machine" does not work, because we already using "docker" type, see
 * https://circleci.com/docs/2.0/executor-types/.
 * We've decided to use the IBM DB2 cloud service.
 *
 * Example connection string for circleci ENV:
 * DATABASE=bludb;HOSTNAME=*.databases.appdomain.cloud;UID=msv01866;PWD=xxx;PORT=31198;PROTOCOL=TCPIP;SECURITY=SSL
 *
 * database, hostname and port:
 *   - Go to https://cloud.ibm.com/resources. Click on your instance.
 *   - Click "Go to UI"
 *   - Click on the right panel on "administration".
 *
 * username and password:
 *   - Go to https://cloud.ibm.com/resources. Click on your instance.
 *   - Click on service credential
 *   - Create service credential
 *   - Copy User & Pws from the JSON
 *
 *
 * We are unable to create databases.
 * 1. locally with docker: https://github.com/ibmdb/node-ibm_db/issues/848
 * 2. remote on circleci: SQL1092N  The requested command or operation failed
 *                        because the user ID does not have the authority to perform
 *                        the requested command or operation.  User ID: "MSV01866".
 *
 * That's why we use random names for tables.
 */

if (process.env.CI) {
  connStr = process.env.DB2_CONNECTION_STR;
  if (!connStr) {
    throw new Error(
      'No connection string for IBM DB2, please make sure the environment variable DB2_CONNECTION_STR is set.'
    );
  }
}

let connection;

const DB2_TABLE_NAME_1 = process.env.DB2_TABLE_NAME_1;
const DB2_TABLE_NAME_2 = process.env.DB2_TABLE_NAME_2;
const DB2_TABLE_NAME_3 = process.env.DB2_TABLE_NAME_3;

/**
 * The docker compose db2 image takes a long time to
 * allow connections initially.
 *
 * Furthermore the connection creation is sometimes slow too.
 */
let tries = 0;
const MAX_TRIES = 10;
const CONNECT_TIMEOUT_IN_MS = 500;
let stmtObjectFromStart;

const connect = () => {
  console.log(`trying to connect: ${tries}`);

  ibmdb.open(`${connStr};DATABASE=${DB2_NAME}`, function (err, conn) {
    if (err) {
      console.log(err);

      if (tries > MAX_TRIES) {
        throw err;
      }

      tries += 1;
      return setTimeout(() => {
        console.log('Trying again...');
        connect();
      }, CONNECT_TIMEOUT_IN_MS);
    }

    console.log('Successfully connected.');

    conn.querySync(`drop table ${DB2_TABLE_NAME_1} if exists`);
    conn.querySync(`create table ${DB2_TABLE_NAME_1} (COLINT INTEGER, COLDATETIME TIMESTAMP, COLTEXT VARCHAR(255))`);

    conn.prepare(`SELECT * FROM ${DB2_TABLE_NAME_1}`, (prepareErr, stmtObject) => {
      if (prepareErr) throw prepareErr;

      stmtObjectFromStart = stmtObject;
      connection = conn;
    });
  });
};

connect();

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => {
  if (!connection) {
    res.sendStatus(500);
  } else {
    res.sendStatus(200);
  }
});

app.delete('/conn', (req, res) => {
  console.log('deleting conn');
  connection.closeSync();
  connection = null;
  console.log('deleted conn');

  res.sendStatus(200);
});

app.delete('/tables', (req, res) => {
  console.log('deleting tables...');

  connection.querySync(`drop table ${DB2_TABLE_NAME_1}`);
  connection.querySync(`drop table ${DB2_TABLE_NAME_2}`);
  connection.querySync(`drop table ${DB2_TABLE_NAME_3}`);

  console.log('deleted tables');

  res.sendStatus(200);
});

app.get('/query-promise', (req, res) => {
  if (!connection) {
    return res.sendStatus(500);
  }

  const simulateErr = req.query.err;
  let query = 'select 1 from sysibm.sysdummy1';

  if (simulateErr) {
    query = 'select invalid query';
  }

  connection.query(query).then(
    data => {
      res.status(200);
      res.send({
        data
      });
    },
    err => {
      res.status(simulateErr ? 200 : 500);
      res.send({ err: err.message });
    }
  );
});

app.get('/query-cb', (req, res) => {
  if (!connection) {
    return res.sendStatus(500);
  }

  const args = (req.query.args && Number(req.query.args)) || 2;
  const simulateErr = req.query.err;
  let query = 'select 1 from sysibm.sysdummy1';

  if (simulateErr) {
    query = 'select invalid query';
  }

  const cb = (err, data) => {
    if (err) {
      res.status(simulateErr ? 200 : 500);
      res.send({ err: err.message });
      return;
    }

    res.status(200);
    res.send({
      data
    });
  };

  if (args === 3) {
    query = 'select creator, name from sysibm.systables where 1 = ?';
    return connection.query(query, [1], cb);
  }

  connection.query(query, cb);
});

app.get('/query-sync', (req, res) => {
  if (!connection) {
    return res.sendStatus(500);
  }

  const simulateErr = req.query.err;

  if (simulateErr) {
    /**
     * There are two types of errors
     *
     * 1. Not connected to the database,
     *    see https://github.com/ibmdb/node-ibm_db/blob/27bf53607793782e67acbb17b80434caf98a16d7/lib/odbc.js#L811-L814
     * 2. Invalid query
     */
    if (simulateErr === 'conn') {
      connection.connected = false;
    }

    let err;

    try {
      err = connection.querySync('select invalid query');
    } catch (e) {
      err = e;
    }

    connection.connected = true;

    res.status(200);
    res.send({
      err: err.message
    });

    return;
  }

  const data = connection.querySync('select 1 from sysibm.sysdummy1');
  res.status(200);
  res.send({
    data
  });
});

app.get('/transaction-sync', (req, res) => {
  const commit = req.query.commit || false;
  const type = req.query.type || 'async';
  const stmt = `insert into ${DB2_TABLE_NAME_1}(COLINT, COLDATETIME, COLTEXT) VALUES (42, null, null)`;

  if (type === 'sync') {
    connection.beginTransactionSync();
    const data = connection.querySync(stmt);
    connection.endTransactionSync(Boolean(commit));
    return res.status(200).send({ data });
  }

  connection.beginTransaction(function (err) {
    if (err) {
      return res.status(500).send({ err: err.message });
    }

    connection.querySync(stmt);

    // false === commit, true === rollback
    connection.endTransaction(Boolean(commit), function (subErr, data) {
      if (subErr) {
        return res.status(500).send({ err: subErr.message });
      }

      res.status(200).send({ data });
    });
  });
});

app.get('/transaction-async', (req, res) => {
  const commit = req.query.commit || false;
  const type = req.query.type || 'async';
  const stmt = `insert into ${DB2_TABLE_NAME_1}(COLINT, COLDATETIME, COLTEXT) VALUES (42, null, null)`;

  if (type === 'sync') {
    connection.beginTransactionSync();

    connection.query(stmt, function (err, data) {
      if (err) return res.status(500).send({ err: err.message });

      connection.endTransactionSync(Boolean(commit));
      return res.status(200).send({ data });
    });

    return;
  }

  connection.beginTransaction(function (err) {
    if (err) return res.status(500).send({ err: err.message });

    connection.query(stmt, function (subErr, data) {
      if (err) return res.status(500).send({ err: subErr.message });

      // false === commit, true === rollback
      connection.endTransaction(Boolean(commit), function (subSubErr) {
        if (subErr) return res.status(500).send({ err: subSubErr.message });

        res.status(200).send({ data });
      });
    });
  });
});

app.get('/prepare-on-start', function (req, res) {
  const skipClose = req.query.skipClose || false;
  const sync = req.query.sync || false;

  if (sync) {
    const result3 = stmtObjectFromStart.executeSync();
    result3.closeSync();
    const result4 = stmtObjectFromStart.executeSync();
    result4.closeSync();
    res.status(200).send({ data: result4 });
    return;
  }

  stmtObjectFromStart.execute(function (err1, result1) {
    if (err1) return res.status(500).send({ err: err1.message });
    if (!skipClose) result1.closeSync();

    stmtObjectFromStart.execute(function (err2, result2) {
      if (err2) return res.status(skipClose ? 200 : 500).send({ err: err2.message });

      result2.closeSync();
      res.status(200).send({ data: result2 });
    });
  });
});

let prepareToRem;
app.get('/prepare-in-http', function (req, res) {
  const stmt = `SELECT * FROM ${DB2_TABLE_NAME_1}`;

  connection.prepare(stmt, (err, stmtObject) => {
    if (err) return res.status(500).send({ err: err.message });
    prepareToRem = stmtObject;
    res.status(200).send({ data: stmtObject });
  });
});
app.get('/execute-in-http', function (req, res) {
  prepareToRem.execute(function (subErr, result) {
    if (subErr) return res.status(500).send({ err: subErr.message });

    result.closeSync();
    res.status(200).send({ data: result });
  });
});

app.get('/prepare-execute-async', (req, res) => {
  const reuse = req.query.reuse;
  const error = req.query.error;
  const extraQuery = req.query.extraQuery;
  let stmt = `insert into ${DB2_TABLE_NAME_1} (COLINT, COLDATETIME, COLTEXT) VALUES (?, ?, ?)`;
  const params = [2, null, 'Adidas'];

  if (error === 'execute') {
    params[1] = 'any string';
  }

  if (error === 'prepare') {
    stmt = '';
  }

  if (extraQuery) {
    connection.querySync(`insert into ${DB2_TABLE_NAME_1} values (3, null, 'something')`);
  }

  connection.prepare(stmt, (err, stmtObject) => {
    if (err) return res.status(error ? 200 : 500).send({ err: err.message });

    stmtObject.execute(params, function (subErr, result) {
      if (subErr) return res.status(error ? 200 : 500).send({ err: subErr.message });

      result.closeSync();

      if (reuse) {
        stmtObject.execute([3, null, 'Nike'], function (subSubErr, anotherResult) {
          if (subSubErr) return res.status(error ? 200 : 500).send({ err: subSubErr.message });

          anotherResult.closeSync();
          res.status(200).send({ data: anotherResult });
        });
      } else {
        // NOTE: signalises that we do not want to fetch!
        result.closeSync();
        res.status(200).send({ data: result });
      }
    });
  });
});

app.get('/prepare-execute-transaction', (req, res) => {
  const stmt = `insert into ${DB2_TABLE_NAME_1} (COLINT, COLDATETIME, COLTEXT) VALUES (?, ?, ?)`;
  const params = [2, null, 'Adidas'];

  connection.beginTransaction(errTxn => {
    if (errTxn) return res.status(500).send({ err: errTxn.message });

    connection.prepare(stmt, (err, stmtObject) => {
      if (err) return res.status(500).send({ err: err.message });

      stmtObject.execute(params, function (subErr, result) {
        if (subErr) return res.status(500).send({ err: subErr.message });

        result.closeSync();

        connection.endTransaction(false, () => {
          res.status(200).send({ data: result });
        });
      });
    });
  });
});

app.get('/prepare-execute-fetch-async', (req, res) => {
  const stmt = `SELECT * FROM ${DB2_TABLE_NAME_1}`;
  const error = req.query.error;

  connection.prepare(stmt, (err, stmtObject) => {
    if (err) return res.status(500).send({ err: err.message });

    stmtObject.execute(function (subErr, result) {
      if (subErr) return res.status(500).send({ err: subErr.message });

      function cb(subSubErr, data) {
        if (subSubErr) return res.status(error ? 200 : 500).send({ err: subSubErr.message });

        // NOTE: signalises that we are finished!
        result.closeSync();
        res.status(200).send({ data });
      }

      const args = [];

      if (error) {
        args.push(null);
        args.push(null);
        args.push(cb);
      } else {
        args.push(cb);
      }

      try {
        result.fetchAll(...args);
      } catch (fetchAllErr) {
        result.closeSync();
        res.status(error ? 200 : 500).send({ data: {} });
      }
    });
  });
});

app.get('/prepare-execute-fetch-sync', (req, res) => {
  try {
    connection.querySync(`drop table ${DB2_TABLE_NAME_2} if exists`);
    connection.querySync(`create table ${DB2_TABLE_NAME_2} (col1 varchar(40), col2 int)`);
    connection.querySync(`insert into ${DB2_TABLE_NAME_2} values ('something', 42)`);
    connection.querySync(`insert into ${DB2_TABLE_NAME_2} values ('für', 43)`);

    const stmt = connection.prepareSync(`select * from ${DB2_TABLE_NAME_2}`);
    const result = stmt.executeSync();

    // NOTE: fetch row by row
    let data = 0;
    // eslint-disable-next-line no-cond-assign
    while ((data = result.fetchSync({ fetchMode: 3 }))) {
      // ignore
    }

    result.closeSync();

    connection.querySync(`drop table ${DB2_TABLE_NAME_2}`);
    res.status(200).send({ data });
  } catch (err) {
    res.status(500).send({ err: err.message });
  }
});

app.get('/prepare-execute-mixed-1', (req, res) => {
  const error = req.query.error || false;
  const skipClose = req.query.skipClose;
  const fetchType = req.query.fetchType;
  let stmt = `SELECT * FROM ${DB2_TABLE_NAME_1}`;

  if (error && error === 'fetchSync') {
    stmt = `insert into ${DB2_TABLE_NAME_1}(COLINT, COLDATETIME, COLTEXT) VALUES (88, null, null)`;
  }
  let params = [];

  connection.prepare(stmt, (err, stmtObject) => {
    if (err) return res.status(500).send({ err: err.message });

    if (error === 'executeRaise') {
      // NOTE: will raise an error in executeSync
      // throws TypeError: Argument 1 must be an Array
      params = {};
    }

    try {
      const result = stmtObject.executeSync(params);

      if (fetchType === 'fetch') {
        result.fetch(function (fetchErr1, row1) {
          if (fetchErr1) return res.status(500).send({ err: fetchErr1.message });

          function cb(fetchErr2, row2) {
            if (fetchErr2) return res.status(error ? 200 : 500).send({ err: fetchErr2.message });
            if (!skipClose) result.closeSync();

            res.status(200).send({ data: { row1, row2 } });
          }

          const args = [];

          if (error && error === 'fetch') {
            // This will raise an error, not a cb error
            // NOTE: this case will not call "closeSync", which triggers the timeout in the db2 instrumentation
            args.push(null);
            args.push(null);
          }

          args.push(cb);

          try {
            result.fetch(...args);
          } catch (fetchErr3) {
            result.closeSync();
            res.status(error ? 200 : 500).send({ data: fetchErr3.message });
          }
        });
      } else if (fetchType === 'fetchSync') {
        let data = 0;

        // eslint-disable-next-line no-cond-assign
        while ((data = result.fetchSync({ fetchMode: 3 }))) {
          // ignore
        }

        if (!skipClose) result.closeSync();
        res.status(200).send({ data });
      } else {
        if (!skipClose) result.closeSync();

        res.status(200).send({ data: result });
      }
    } catch (executeError) {
      res.status(error ? 200 : 500).send({ err: executeError.message });
    }
  });
});

app.get('/prepare-execute-mixed-2', (req, res) => {
  let stmtObject;
  const skipClose = req.query.skipClose;

  try {
    stmtObject = connection.prepareSync(`SELECT * FROM ${DB2_TABLE_NAME_1}`);
  } catch (err) {
    return res.status(500).send({ err: err.message });
  }

  stmtObject.execute(function (subErr, result) {
    if (subErr) return res.status(500).send({ err: subErr.message });

    if (!skipClose) result.closeSync();

    res.status(200).send({ data: result });
  });
});

app.get('/execute-file-sync', (req, res) => {
  // ; is the default delimiter
  const filename = req.query.file || 'sample1.txt';
  const delimiter = req.query.file ? '%' : ';';

  let content = fs.readFileSync(`${__dirname}/resources/${filename}`, 'utf8');
  content = content.replace(/{TABLE_NAME}/g, DB2_TABLE_NAME_3);

  const newFilePath = `${__dirname}/resources/${filename}_r`;
  fs.writeFileSync(newFilePath, content);

  try {
    const rows = connection.executeFileSync(newFilePath, delimiter);
    fs.unlinkSync(newFilePath);

    if (rows instanceof Error) {
      return res.status(500).send({ err: rows.message });
    }

    res.status(200).send({ data: rows });
  } catch (err) {
    fs.unlinkSync(newFilePath);

    res.status(500).send({ err: err.message });
  }
});

app.get('/execute-file-async', (req, res) => {
  // ; is the default delimiter
  const filename = req.query.file || 'sample1.txt';
  const delimiter = req.query.file ? '%' : ';';

  let content = fs.readFileSync(`${__dirname}/resources/${filename}`, 'utf8');
  content = content.replace(/{TABLE_NAME}/g, DB2_TABLE_NAME_3);

  const newFilePath = `${__dirname}/resources/${filename}_r`;
  fs.writeFileSync(newFilePath, content);

  connection.executeFile(newFilePath, delimiter, function (err, data) {
    fs.unlinkSync(newFilePath);

    if (err) {
      return res.status(500).send({ err: err.message });
    }

    res.status(200).send({ data });
  });
});

app.get('/prepare-execute-non-query-sync', (req, res) => {
  const error = req.query.error;

  const stmtObject = connection.prepareSync(
    `insert into ${DB2_TABLE_NAME_1}(COLINT, COLDATETIME, COLTEXT) VALUES (?, ?, ?)`
  );
  let params = [22, null, null];

  if (error) {
    params = [];
  }

  try {
    const rowCount = stmtObject.executeNonQuerySync(params);
    res.status(200).send({ data: rowCount });
  } catch (err) {
    res.status(error ? 200 : 500).send({ data: err.message });
  }
});

app.get('/query-result-async', (req, res) => {
  const txn = req.query.transaction;
  const stmt = `SELECT * FROM ${DB2_TABLE_NAME_1}`;

  if (txn) {
    connection.beginTransactionSync();
  }

  connection.queryResult(stmt, function (err, result) {
    if (err) return res.status(500).send({ err: err.message });

    const data = result.fetchAllSync();
    result.closeSync();

    if (txn) {
      connection.commitTransactionSync();
    }

    res.status(200).send({ data });
  });
});

app.get('/query-result-sync', (req, res) => {
  const txn = req.query.transaction;

  if (txn) {
    connection.beginTransactionSync();
  }

  try {
    const stmt = `SELECT * FROM ${DB2_TABLE_NAME_1}`;
    const result = connection.queryResultSync(stmt);

    if (txn) {
      connection.commitTransactionSync();
    }

    const data = result.fetchAllSync();
    result.closeSync();
    res.status(200).send({ data });
  } catch (err) {
    return res.status(500).send({ err: err.message });
  }
});

// This is automatically instrumented because `queryResult` is used internally
app.get('/query-stream', (req, res) => {
  const error = req.query.error;
  let stmt = 'select 1 from sysibm.sysdummy1';
  const params = [];

  if (error) stmt = 'wrong query';

  const stream = connection.queryStream(stmt, params);

  // NOTE: I was not able to produce multiple results
  //       From their code base it looks like this is not possible
  //       That's why we use .once here
  stream
    .once('data', function (result) {
      if (result) {
        res.status(200).send({ data: result });
      }
    })
    .once('error', function (err) {
      return res.status(error ? 200 : 500).send({ err: err.message });
    });
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
