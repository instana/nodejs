/*
 * (c) Copyright IBM Corp. 2025
 */

/* eslint-disable no-console */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('@instana/collector')();

const oracledb = require('oracledb');
const port = require('../../test_util/app-port')();
const delay = require('@instana/core/test/test_util/delay');
const logPrefix = `Oracle App (${process.pid}):\t`;
const express = require('express');
const app = express();

let connected = false;
let connection;

(async function connect() {
  try {
    connection = await oracledb.getConnection({
      user: 'teamnodejs',
      password: 'teamnodejspassword',
      connectString: `${process.env.ORACLEDB}/FREEPDB1`
    });

    connected = true;
    log('Connected to OracleDB');
  } catch (err) {
    log('Failed to connect to OracleDB:', err);
    log('Retrying in a few seconds...');
    await delay(1000 * 5);
    await connect();
  }
})();

app.get('/', (req, res) => {
  if (!connected) {
    return res.sendStatus(500);
  }

  res.sendStatus(200);
});

app.get('/trace', async (req, res) => {
  // Test with positional bind variables
  await connection.execute('SELECT 1 FROM DUAL WHERE 1 = :1', [1]);
  log('Executed query with positional bind variable');
  res.sendStatus(200);
});

app.get('/trace-named', async (req, res) => {
  // Test with named bind variables
  await connection.execute('SELECT :value FROM DUAL WHERE 1 = :condition', { value: 1, condition: 1 });
  log('Executed query with named bind variables');
  res.sendStatus(200);
});

app.get('/trace-multiple', async (req, res) => {
  // Test with multiple positional bind variables
  await connection.execute('SELECT :1 as col1, :2 as col2, :3 as col3 FROM DUAL', [123, 'test string', null]);
  log('Executed query with multiple bind variables');
  res.sendStatus(200);
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
