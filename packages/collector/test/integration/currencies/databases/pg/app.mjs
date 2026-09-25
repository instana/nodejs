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

import _pg from 'pg';
import express from 'express';
import morgan from 'morgan';
import bodyParser from 'body-parser';
const { default: getAppPort } = await import('@_local/collector/test/test_util/app-port.js');

const agentPort = process.env.INSTANA_AGENT_PORT;
const Pool = _pg.Pool;
const Client = _pg.Client;
const port = getAppPort();
const app = express();
const logPrefix = `Express / Postgres ESM App (${process.pid}):\t`;
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

const createBlobTableQuery =
  'CREATE TABLE IF NOT EXISTS blobs(id serial primary key, name varchar(40) NOT NULL, data bytea)';

pool.query(createBlobTableQuery, err => {
  if (err) {
    log('Failed to create blobs table', err);
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
  // string query + positional array: both name and email columns present in WHERE clause
  await client.query('SELECT * FROM users WHERE name = $1 AND email = $2', ['testuser', 'test@example.com']);

  // config object with values property: INSERT – no column=$N patterns so nothing resolves
  await pool.query({
    text: 'INSERT INTO users(name, email) VALUES($1, $2) RETURNING *',
    values: ['bindtest', 'bindtest@example.com']
  });

  res.json({ success: true });
});

app.get('/bind-variables-allowed-columns-test', async (req, res) => {
  // Only the 'name' column should be captured (email excluded by allowed-columns config)
  await client.query('SELECT * FROM users WHERE name = $1 AND email = $2', ['alloweduser', 'allowed@example.com']);

  // UPDATE: both name and email in SET + id in WHERE — only 'name' captured
  await client.query('UPDATE users SET name = $1, email = $2 WHERE id = $3', ['updatedname', 'upd@example.com', 1]);

  res.json({ success: true });
});

// Spec example: Unqualified allowed-columns entry matches qualified column name
app.get('/bind-variables-qualified-col-test', async (req, res) => {
  await client.query('SELECT * FROM orders WHERE orders.id = $1', [42]);
  res.json({ success: true });
});

// Spec example: Fully qualified allowed-columns entry does NOT match bare column name
app.get('/bind-variables-qualified-entry-no-match-test', async (req, res) => {
  await client.query('SELECT * FROM users WHERE id = $1', [99]);
  res.json({ success: true });
});

// Spec example: null value represented as "null"
app.get('/bind-variables-null-value-test', async (req, res) => {
  // Use 'name' column (which is in the allowed-columns for this test) with a null value
  await pool.query('SELECT * FROM users WHERE name = $1', [null]);
  res.json({ success: true });
});

// Spec example: OR clause — same column referenced twice with distinct params
app.get('/bind-variables-or-clause-test', async (req, res) => {
  await client.query('SELECT * FROM users WHERE name = $1 OR name = $2', ['alice', 'bob']);
  res.json({ success: true });
});

// Spec: Binary data (Buffer) represented as "<binary>"
app.get('/bind-variables-binary-test', async (req, res) => {
  const binaryData = Buffer.from('binary-payload');
  await client.query('UPDATE blobs SET data = $1 WHERE name = $2', [binaryData, 'testblob']);
  res.json({ success: true });
});

// Spec: Unsupported type (plain object) represented as "<unsupported>"
app.get('/bind-variables-unsupported-test', async (req, res) => {
  // pg serialises plain objects via JSON, but our tracer sees it before serialisation
  await client.query('SELECT * FROM users WHERE name = $1', [{ key: 'value' }]);
  res.json({ success: true });
});

// Spec: Stored procedure — bind variable captured for the function call argument
app.get('/bind-variables-stored-procedure-test', async (req, res) => {
  const result = await client.query('SELECT * FROM get_user_by_name($1)', ['proceduretest']);
  res.json({ success: true, rows: result.rows });
});

// Spec: 100-entry cap — 150 params total:
//   positions 1-100 (indices 0-99):  even indices → name (allowed), odd indices → email (not allowed)
//                                    → 50 name + 50 email in the first 100
//   positions 101-150 (indices 100-149): all name (allowed)
// After allowed-columns filtering: 50 from first 100 + 50 from remaining 50 = exactly 100 captured.
app.get('/bind-variables-cap-test', async (req, res) => {
  const conditions = Array.from({ length: 150 }, (_, i) => {
    // Within the first 100: even indices are name (allowed), odd indices are email (not allowed)
    const col = i < 100 && i % 2 !== 0 ? 'email' : 'name';
    return `${col} = $${i + 1}`;
  }).join(' OR ');
  const values = Array.from({ length: 150 }, (_, i) => `val${i}`);
  await client.query(`SELECT * FROM users WHERE ${conditions}`, values);
  res.json({ success: true });
});

// Spec: Span batching — two quick successive queries; only the last (merged) span's binds are reported
app.get('/bind-variables-span-batching-test', async (req, res) => {
  // Fire two queries back-to-back without awaiting — they should be batched into one span
  client.query('SELECT * FROM users WHERE name = $1', ['first-query']);
  await client.query('SELECT * FROM users WHERE name = $1', ['last-query']);
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
