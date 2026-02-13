/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

import { promisify } from 'util';
import ibmdb from 'ibm_db';
import delay from '@_local/core/test/test_util/delay.js';

const logPrefix = `DB2 Allow Root Exit Span App (${process.pid}):\t`;

const DB2_DATABASE_NAME = process.env.DB2_DATABASE_NAME || 'nodedb';
const connStr1 = process.env.DB2_CONN_STR || 'HOSTNAME=localhost;UID=node;PWD=nodepw;PORT=58885;PROTOCOL=TCPIP';
let connection;

const DB2_TABLE_NAME_1 = process.env.DB2_TABLE_NAME_1 || 'table1';

let tries = 0;
const MAX_TRIES = 10;
const CONNECT_TIMEOUT_IN_MS = 2000;

const db2OpenPromisified = promisify(ibmdb.open);

async function connect(connectionStr) {
  log(`Trying to connect to DB2, attempt ${tries} of ${MAX_TRIES}`);

  let conn;
  try {
    conn = await db2OpenPromisified(connectionStr);
  } catch (err) {
    log(err);
    if (tries > MAX_TRIES) {
      throw err;
    }

    tries += 1;
    log(`Trying to connect to DB2 again in ${CONNECT_TIMEOUT_IN_MS} milliseconds.`);
    await delay(CONNECT_TIMEOUT_IN_MS);
    return connect(connectionStr);
  }

  log('A client has successfully connected.');
  return conn;
}

(async function openConnections() {
  await delay(1000 * 2);
  connection = await connect(`${connStr1};DATABASE=${DB2_DATABASE_NAME}`);

  connection.querySync(`drop table ${DB2_TABLE_NAME_1} if exists`);

  const result = connection.querySync(
    `create table ${DB2_TABLE_NAME_1} (COLINT INTEGER, COLDATETIME TIMESTAMP, COLTEXT VARCHAR(255))`
  );

  if (!(result instanceof Array)) {
    throw new Error(result);
  }

  log('Clients is successfully connected.');

  const prepareStmt = connection.prepareSync(`SELECT * FROM ${DB2_TABLE_NAME_1}`);
  const executeResult = prepareStmt.executeSync();
  executeResult.closeSync();

  connection.beginTransaction(function (err) {
    if (err) {
      log(err);
      return;
    }

    connection.query(`SELECT * FROM ${DB2_TABLE_NAME_1}`, function (err1) {
      if (err1) {
        log(err);
        return;
      }

      connection.endTransaction(false, function (err2) {
        if (err2) {
          log(err);
          return;
        }

        log('Transaction has been committed.');
      });
    });
  });
})();

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
