'use strict';

// eslint-disable-next-line import/no-unresolved
const instana = require('@instana/serverless');

const pg = require('pg');

const pgHost = process.env.RDS_HOSTNAME || 'localhost';
const pgPort = process.env.RDS_PORT || '5432';
const pgDatabase = process.env.RDS_DB_NAME || 'lambdademo';
const pgUser = process.env.RDS_USERNAME || 'postgres';
const pgPassword = process.env.RDS_PASSWORD;

console.log(
  `Using PG config: ${pgHost}:${pgPort}/${pgDatabase}, user ${pgUser}, ${
    pgPassword ? 'a password has been provided.' : 'no password has been provided!'
  }`
);

exports.handler = instana.awsLambda.wrap(async event => {
  const label = event.Records.slice(0, 20).map(
    s3Record =>
      `${s3Record.eventName}: ${s3Record.s3 && s3Record.s3.bucket ? s3Record.s3.bucket.name : ''}/${s3RecordToObject(
        s3Record
      )}`
  );

  const client = await connect();
  try {
    await client.query('INSERT INTO items(label) VALUES($1) RETURNING *', [label]);
    console.log(`Created: ${label}.`);
  } catch (err) {
    console.log('Failed to execute insert.', JSON.stringify(err));
  } finally {
    await client.end();
  }
});

function s3RecordToObject(s3Record) {
  if (s3Record.s3 && s3Record.s3.object && s3Record.s3.object.key) {
    return s3Record.s3.object.key.length > 200
      ? `${s3Record.s3.object.key.substring(0, 200)}…`
      : s3Record.s3.object.key;
  } else {
    return '';
  }
}

async function connect() {
  const client = new pg.Client({
    host: pgHost,
    port: pgPort,
    database: pgDatabase,
    user: pgUser,
    password: pgPassword
  });
  await client.connect();
  return client;
}
