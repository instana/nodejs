/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

import { promisify } from 'util';
import bodyParser from 'body-parser';
import express from 'express';
import fs from 'fs';
import morgan from 'morgan';
import ibmdb from 'ibm_db';
import testUtil from '@instana/core/test/test_util/index.js';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import getAppPort from '../../../test_util/app-port.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = getAppPort();
const logPrefix = `DB2 App (${process.pid}):\t`;
const delay = testUtil.delay;

const DB2_DATABASE_NAME = process.env.DB2_DATABASE_NAME || 'nodedb';
const connStr1 = process.env.DB2_CONN_STR || 'HOSTNAME=localhost;UID=node;PWD=nodepw;PORT=58885;PROTOCOL=TCPIP';
const connStr2 =
  process.env.DB2_CONN_STR_ALTERNATIVE || 'HOSTNAME=127.0.0.1;UID=node;PWD=nodepw;PORT=58885;PROTOCOL=TCPIP';

/**
 * See app.js for background information to db2.
 */

let connection;
let connection2;

const DB2_TABLE_NAME_1 = process.env.DB2_TABLE_NAME_1 || 'table1';
const DB2_TABLE_NAME_2 = process.env.DB2_TABLE_NAME_2 || 'table2';
const DB2_TABLE_NAME_3 = process.env.DB2_TABLE_NAME_3 || 'table3';

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

const db2OpenPromisified = promisify(ibmdb.open);

async function connect(connectionStr) {
  /* eslint-disable no-console */
  console.log(`Trying to connect to DB2, attempt ${tries} of ${MAX_TRIES}`);

  let conn;
  try {
    conn = await db2OpenPromisified(connectionStr);
  } catch (err) {
    console.log(err);
    if (tries > MAX_TRIES) {
      throw err;
    }

    tries += 1;
    console.log(`Trying to connect to DB2 again in ${CONNECT_TIMEOUT_IN_MS} milliseconds.`);
    await delay(CONNECT_TIMEOUT_IN_MS);
    return connect(connectionStr);
  }
  console.log('A client has successfully connected.');
  return conn;
  /* eslint-enable no-console */
}

(async function openConnections() {
  /* eslint-disable no-console */
  connection = await connect(`${connStr1};DATABASE=${DB2_DATABASE_NAME}`);

  connection.querySync(`drop table ${DB2_TABLE_NAME_1} if exists`);
  const result = connection.querySync(
    `create table ${DB2_TABLE_NAME_1} (COLINT INTEGER, COLDATETIME TIMESTAMP, COLTEXT VARCHAR(255))`
  );
  if (!(result instanceof Array)) {
    throw new Error(result);
  }
  stmtObjectFromStart = connection.prepareSync(`SELECT * FROM ${DB2_TABLE_NAME_1}`);

  connection2 = await connect(`${connStr2};DATABASE=${DB2_DATABASE_NAME}`);

  console.log('Both clients have successfully connected.');
  /* eslint-enable no-console */
})();

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => {
  if (!connection || !connection2) {
    res.sendStatus(500);
  } else {
    res.sendStatus(200);
  }
});

app.delete('/conn', (req, res) => {
  /* eslint-disable no-console */
  console.log('deleting conn');

  if (connection) {
    connection.closeSync();
    connection = null;
    console.log('connection 1 has been closed');
  }

  if (connection2) {
    connection2.closeSync();
    connection2 = null;
    console.log('connection 2 has been closed');
  }

  res.sendStatus(200);
  /* eslint-enable no-console */
});

app.delete('/tables', (req, res) => {
  /* eslint-disable no-console */
  console.log('deleting tables...');

  if (!connection) {
    return res.sendStatus(200);
  }

  connection.querySync(`drop table ${DB2_TABLE_NAME_1}`);
  connection.querySync(`drop table ${DB2_TABLE_NAME_2}`);
  connection.querySync(`drop table ${DB2_TABLE_NAME_3}`);

  console.log('deleted tables');

  res.sendStatus(200);
  /* eslint-enable no-console */
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
        if (subSubErr) return res.status(500).send({ err: subSubErr.message });

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

app.get('/two-different-target-hosts', async (req, res) => {
  if (!connection) {
    log('Client 1 is not connected.');
    return res.sendStatus(500);
  }
  if (!connection2) {
    log('Client 2 is not connected.');
    return res.sendStatus(500);
  }

  const response = {};
  try {
    response.data1 = await connection.query('select 1 from sysibm.sysdummy1');
  } catch (e) {
    log('The first DB2 query failed.', e);
    return res.sendStatus(500);
  }
  try {
    response.data2 = await connection2.query("select 'a' from sysibm.sysdummy1");
  } catch (e) {
    log('The second DB2 query failed.', e);
    return res.sendStatus(500);
  }
  res.json(response);
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
