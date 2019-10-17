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
  if (!event.time || typeof event.time !== 'string') {
    // malformed event, probably not triggered by a CloudWatch event
    console.log('Event has no timestamp or timestamp is not a string. Aborting.');
    return;
  }

  const client = await connect();
  try {
    // 1. Delete all items older than 24 hours (just so the table does not grow indefinitely).
    await client.query("DELETE FROM items WHERE timestamp < now()-'12 hours'::interval");
    console.log('Deleted old items.');

    // 2. Create a new item
    const label = `Created by CloudWatch Event at ${event.time}.`;
    await client.query('INSERT INTO items(label) VALUES($1) RETURNING *', [label]);
    console.log(`Created: ${label}.`);
  } catch (err) {
    console.log('Failed to access database.', JSON.stringify(err));
  } finally {
    await client.end();
  }
});

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
