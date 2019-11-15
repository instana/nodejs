'use strict';

// eslint-disable-next-line import/no-extraneous-dependencies
const instana = require('@instana/aws-lambda'); // provided by Lambda layer "instana"

const pg = require('pg');
const request = require('request-promise');

const pgHost = process.env.RDS_HOSTNAME || 'localhost';
const pgPort = process.env.RDS_PORT || '5432';
const pgDatabase = process.env.RDS_DB_NAME || 'lambdademo';
const pgUser = process.env.RDS_USERNAME || 'postgres';
const pgPassword = process.env.RDS_PASSWORD;
const auditLogServiceUrl =
  process.env.AUDIT_LOG_SERVICE_URL || 'https://ec2-3-15-208-8.us-east-2.compute.amazonaws.com:2808/audit-log';

console.log(
  `Using PG config: ${pgHost}:${pgPort}/${pgDatabase}, user ${pgUser}, ${
    pgPassword ? 'a password has been provided.' : 'no password has been provided!'
  }`
);

exports.handler = instana.wrap(async event => {
  if (!event.httpMethod || !event.path) {
    // malformed event, probably not an API gateway request
    return { statusCode: 400, headers: corsAllowAll() };
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsAllowAll() };
  } else if (event.path === '/items') {
    return handleItemsRequest(event);
  } else if (event.resource === '/items/{itemId}') {
    return handleSingleItemRequest(event);
  }
  return { statusCode: 404, headers: corsAllowAll() };
});

async function handleItemsRequest(event) {
  if (event.httpMethod === 'GET') {
    return handleList();
  } else if (event.httpMethod === 'POST') {
    return handleCreate(event);
  } else {
    return { statusCode: 405, headers: corsAllowAll() };
  }
}

async function handleList() {
  await writeAuditLog('list request');
  const client = await connect();
  try {
    const results = await client.query('SELECT id, label FROM items');

    return {
      statusCode: 200,
      headers: corsAllowAll(),
      body: JSON.stringify({
        items: results.rows
      })
    };
  } catch (err) {
    console.log('Failed to execute SELECT.', err);
    return { statusCode: 500, headers: corsAllowAll() };
  } finally {
    await client.end();
  }
}

async function handleCreate(event) {
  await writeAuditLog('create request');
  if (!event.body) {
    return {
      statusCode: 400,
      headers: corsAllowAll(),
      body: JSON.stringify({
        message: 'No HTTP request body, please send JSON.'
      })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return {
      statusCode: 400,
      headers: corsAllowAll(),
      body: JSON.stringify({
        message: 'Malformed HTTP request body, please send JSON.'
      })
    };
  }

  const client = await connect();
  try {
    const label = body.label || 'new item';
    const values = [label];
    const results = await client.query('INSERT INTO items(label) VALUES($1) RETURNING *', values);

    return {
      statusCode: 201,
      headers: corsAllowAll(),
      body: JSON.stringify({
        item: results.rows[0]
      })
    };
  } catch (err) {
    console.log('Failed to execute insert.', err);
    return { statusCode: 500, headers: corsAllowAll() };
  } finally {
    await client.end();
  }
}

async function handleSingleItemRequest(event) {
  await writeAuditLog('single item request');
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: corsAllowAll() };
  }

  if (!event.pathParameters || !event.pathParameters.itemId) {
    return { statusCode: 404, headers: corsAllowAll() };
  }

  const itemId = parseInt(event.pathParameters.itemId, 10);
  if (isNaN(itemId)) {
    return { statusCode: 404, headers: corsAllowAll() };
  }

  const client = await connect();
  try {
    const result = await client.query('SELECT * FROM items WHERE id = $1', [itemId]);
    if (result.rows.length === 0) {
      return {
        statusCode: 404,
        headers: corsAllowAll()
      };
    } else {
      return {
        statusCode: 200,
        headers: corsAllowAll(),
        body: JSON.stringify(result.rows[0])
      };
    }
  } catch (err) {
    console.log('Failed to execute SELECT.', err);
    return { statusCode: 500, headers: corsAllowAll() };
  } finally {
    await client.end();
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

function writeAuditLog(message) {
  return request({
    method: 'POST',
    url: auditLogServiceUrl,
    body: `{"message":"${message}"}`,
    rejectUnauthorized: false
  })
    .then(() => console.log(`wrote audit log: ${message}`))
    .catch(e => console.error('Could not write audit log:', e));
}

function corsAllowAll() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Timing-Allow-Origin': '*'
  };
}
