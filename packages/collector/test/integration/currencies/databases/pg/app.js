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

const agentPort = process.env.INSTANA_AGENT_PORT;

require('@instana/collector')();
const _pg = require('pg');
const express = require('express');
const morgan = require('morgan');
const bodyParser = require('body-parser');
const port = require('@_local/collector/test/test_util/app-port')();

const Pool = _pg.Pool;
const Client = _pg.Client;
const app = express();
const logPrefix = `Express / Postgres App (${process.pid}):\t`;
const pool = new Pool({
  user: process.env.INSTANA_CONNECT_POSTGRES_USER,
  host: process.env.INSTANA_CONNECT_POSTGRES_HOST,
  database: process.env.INSTANA_CONNECT_POSTGRES_DB,
  password: process.env.INSTANA_CONNECT_POSTGRES_PASSWORD
});
const client = new Client({
  user: process.env.INSTANA_CONNECT_POSTGRES_USER,
  host: process.env.INSTANA_CONNECT_POSTGRES_HOST,
  database: process.env.INSTANA_CONNECT_POSTGRES_DB,
  password: process.env.INSTANA_CONNECT_POSTGRES_PASSWORD
});
client.connect();

const createTableQuery =
  'CREATE TABLE IF NOT EXISTS users(id serial primary key, name varchar(40) NOT NULL, email varchar(40) NOT NULL)';

pool.query(createTableQuery, err => {
  if (err) {
    log('Failed create table query', err);
  }
});

// Create a stored procedure for testing
const createProcedureQuery = `
  CREATE OR REPLACE FUNCTION get_user_by_name(user_name VARCHAR)
  RETURNS TABLE(id INT, name VARCHAR, email VARCHAR) AS $$
  BEGIN
    RETURN QUERY SELECT users.id, users.name, users.email FROM users WHERE users.name = user_name;
  END;
  $$ LANGUAGE plpgsql;
`;

pool.query(createProcedureQuery, err => {
  if (err) {
    log('Failed to create stored procedure', err);
  }
});

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.sendStatus(200);
});

app.get('/select-now-pool', (req, res) => {
  pool.query('SELECT NOW()', (err, results) => {
    if (err) {
      log('Failed to execute select now query', err);
      return res.sendStatus(500);
    }
    // Execute another traced call to verify that we keep the tracing context.
    fetch(`http://127.0.0.1:${agentPort}/ping`).then(() => {
      res.json(results);
    });
  });
});

app.get('/select-now-no-pool-callback', (req, res) => {
  client.query('SELECT NOW()', (err, results) => {
    if (err) {
      log('Failed to execute select now query', err);
      return res.sendStatus(500);
    }
    fetch(`http://127.0.0.1:${agentPort}/ping`).then(() => {
      res.json(results);
    });
  });
});

app.get('/select-now-no-pool-promise', (req, res) => {
  client
    .query('SELECT NOW()')
    .then(results => {
      fetch(`http://127.0.0.1:${agentPort}/ping`).then(() => {
        res.json(results);
      });
    })
    .catch(err => {
      if (err) {
        log('Failed to execute select now query', err);
        return res.sendStatus(500);
      }
    });
});

app.get('/parameterized-query', async (req, res) => {
  await client.query('SELECT * FROM users WHERE name = $1', ['parapeter']);
  res.json({});
});

app.get('/bind-variables-test', async (req, res) => {
  // Test with string query and array parameters
  await client.query('SELECT * FROM users WHERE name = testuser AND email = test@example.com');

  // Test with config object containing values
  await pool.query({
    text: 'INSERT INTO users(name, email) VALUES($1, $2) RETURNING *',
    values: ['bindtest', 'bindtest@example.com']
  });

  res.json({ success: true });
});

app.get('/stored-procedure-test', async (req, res) => {
  // First insert a test user
  await client.query('INSERT INTO users(name, email) VALUES($1, $2) ON CONFLICT DO NOTHING', [
    'proceduretest',
    'procedure@example.com'
  ]);

  // Call stored procedure with bind variable
  const result = await client.query('SELECT * FROM get_user_by_name($1)', ['proceduretest']);

  res.json({ success: true, rows: result.rows });
});

app.get('/all-data-types-test', async (req, res) => {
  // Test with various data types to demonstrate masking

  // 1. String values
  await client.query('SELECT $1::text as string_value', ['sensitive_password_123']);

  // 2. Number values (integer and float)
  await client.query('SELECT $1::integer as int_value, $2::numeric as float_value', [42, 3.14159]);

  // 3. Boolean value
  await client.query('SELECT $1::boolean as bool_value', [true]);

  // 4. null and undefined (null in SQL)
  await client.query('SELECT $1 as null_value', [null]);

  // 5. Date object
  await client.query('SELECT $1::timestamp as date_value', [new Date('2024-01-15T10:30:00Z')]);

  // 6. JSON object
  await client.query('SELECT $1::jsonb as json_value', [
    JSON.stringify({ user: 'john', email: 'john@example.com', preferences: { theme: 'dark', notifications: true } })
  ]);

  // 7. Array (as JSON string for PostgreSQL)
  await client.query('SELECT $1::jsonb as array_value', [JSON.stringify([1, 2, 3, 4, 5])]);

  // 8. Nested JSON with arrays
  await client.query('SELECT $1::jsonb as nested_value', [
    JSON.stringify({
      users: [
        { id: 1, name: 'Alice', email: 'alice@example.com' },
        { id: 2, name: 'Bob', email: 'bob@example.com' }
      ],
      metadata: { created: '2024-01-01', version: 1 }
    })
  ]);

  // 9. Buffer/Binary data (bytea in PostgreSQL)
  const imageBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]); // JPEG header
  await client.query('SELECT $1::bytea as binary_value', [imageBuffer]);

  // 10. Large buffer (simulating file upload)
  const largeBuffer = Buffer.alloc(1024); // 1KB buffer
  await client.query('SELECT $1::bytea as large_binary', [largeBuffer]);

  // 11. Mixed types in single query
  await client.query('SELECT $1::text, $2::integer, $3::boolean, $4::jsonb, $5::bytea', [
    'user@example.com',
    12345,
    false,
    JSON.stringify({ key: 'value' }),
    Buffer.from('secret')
  ]);

  res.json({
    success: true,
    message: 'All data types tested',
    note: 'Check spans to see masked bind variables'
  });
});

app.get('/pool-string-insert', (req, res) => {
  const insert = 'INSERT INTO users(name, email) VALUES($1, $2) RETURNING *';
  const values = ['beaker', 'beaker@muppets.com'];

  pool.query(insert, values, (err, results) => {
    if (err) {
      log('Failed to execute pool insert', err);
      return res.sendStatus(500);
    }
    fetch(`http://127.0.0.1:${agentPort}/ping`).then(() => {
      res.json(results);
    });
  });
});

app.get('/pool-config-select', (req, res) => {
  const query = {
    text: 'SELECT name, email FROM users'
  };

  pool.query(query, (err, results) => {
    if (err) {
      log('Failed to execute pool config insert', err);
      return res.sendStatus(500);
    }
    fetch(`http://127.0.0.1:${agentPort}/ping`).then(() => {
      res.json(results);
    });
  });
});

app.get('/pool-config-select-promise', (req, res) => {
  const query = {
    text: 'INSERT INTO users(name, email) VALUES($1, $2) RETURNING *',
    values: ['beaker', 'beaker@muppets.com']
  };

  pool
    .query(query)
    .then(results => {
      fetch(`http://127.0.0.1:${agentPort}/ping`).then(() => {
        res.json(results);
      });
    })
    .catch(e => {
      log(e.stack);
      return res.sendStatus(500);
    });
});

app.get('/client-string-insert', (req, res) => {
  const insert = 'INSERT INTO users(name, email) VALUES($1, $2) RETURNING *';
  const values = ['beaker', 'beaker@muppets.com'];

  client.query(insert, values, (err, results) => {
    if (err) {
      log('Failed to execute client insert', err);
      return res.sendStatus(500);
    }
    fetch(`http://127.0.0.1:${agentPort}/ping`).then(() => {
      res.json(results);
    });
  });
});

app.get('/client-config-select', (req, res) => {
  const query = {
    text: 'SELECT name, email FROM users'
  };

  client.query(query, (err, results) => {
    if (err) {
      log('Failed to execute client select', err);
      return res.sendStatus(500);
    }
    fetch(`http://127.0.0.1:${agentPort}/ping`).then(() => {
      res.json(results);
    });
  });
});

app.get('/table-doesnt-exist', (req, res) => {
  pool
    .query('SELECT name, email FROM nonexistanttable')
    .then(r => res.json(r))
    .catch(e => {
      fetch(`http://127.0.0.1:${agentPort}/ping`).then(() => {
        res.status(500).json(e);
      });
    });
});

app.get('/transaction', (req, res) => {
  client.query('BEGIN', err1 => {
    if (err1) {
      log('Failed to execute client transaction', err1);
      return res.status(500).json(err1);
    }

    client.query('INSERT INTO users(name, email) VALUES($1, $2) RETURNING *', ['trans1', 'nodejstests@blah'], err2 => {
      if (err2) {
        log('Failed to execute client transaction', err2);
        return res.status(500).json(err2);
      }
      const insertTrans2 = 'INSERT INTO users(name, email) VALUES($1, $2) RETURNING *';
      const insertTrans2Values = ['trans2', 'nodejstests@blah'];
      client.query(insertTrans2, insertTrans2Values, (err3, result3) => {
        if (err3) {
          log('Failed to execute client transaction', err3);
          return res.status(500).json(err3);
        }
        client.query('COMMIT', err4 => {
          if (err4) {
            log('Failed to execute client transaction', err4);
            return res.status(500).json(err4);
          }
          fetch(`http://127.0.0.1:${agentPort}/ping`).then(() => res.json(result3));
        });
      });
    });
  });
});

app.get('/long-running-query', (req, res) => {
  client
    .query('SELECT NOW() FROM pg_sleep(2)')
    .then(results => {
      res.json(results);
    })
    .catch(err => {
      if (err) {
        log('Failed to execute select now query', err);
        return res.sendStatus(500);
      }
    });
});

app.get('/quick-query', (req, res) => {
  client
    .query('SELECT NOW()')
    .then(results => {
      res.json(results);
    })
    .catch(err => {
      if (err) {
        log('Failed to execute select now query', err);
        return res.sendStatus(500);
      }
    });
});
app.get('/asynchronous-query', async (req, res) => {
  try {
    const firstQueryResults = await executeSelectDateQuery();
    const secondQueryResults = executeLongRunningQuery(); // Not waiting for the results
    const thirdQueryResults = inserUser(); // Not waiting for the results

    const combinedResults = {
      firstQuery: firstQueryResults,
      secondQuery: secondQueryResults,
      thirdQuery: thirdQueryResults
    };
    fetch(`http://127.0.0.1:${agentPort}/ping`).then(() => {
      res.json(combinedResults);
    });
  } catch (err) {
    log('Failed to execute queries', err);
    res.sendStatus(500);
  }
});

async function executeSelectDateQuery() {
  return client.query('SELECT NOW()');
}

async function executeLongRunningQuery() {
  try {
    await client.query('SELECT NOW() FROM pg_sleep(2)');
    return 'Long-running query executed successfully.';
  } catch (err) {
    log('Failed to execute long-running query', err);
  }
}

async function inserUser() {
  const insert = 'INSERT INTO users(name, email) VALUES($1, $2) RETURNING *';
  const values = ['beaker', 'beaker@test.com'];

  try {
    await client.query(insert, values);
    return 'User inserted successfully.';
  } catch (err) {
    log('Failed to insert user', err);
  }
}

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
