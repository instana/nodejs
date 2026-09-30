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

const createTableForBinds =
  'CREATE TABLE IF NOT EXISTS blobs(id serial primary key, name varchar(40) NOT NULL, data bytea)';

pool.query(createTableForBinds, err => {
  if (err) {
    log('Failed to create blobs table', err);
  }
});

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

const PG_QUERY_SCENARIOS = {
  'mixed-queries': async () => {
    await client.query('SELECT * FROM users WHERE name = $1 AND email = $2', ['testuser', 'test@example.com']);
    return pool.query({
      text: 'INSERT INTO users(name, email) VALUES($1, $2) RETURNING *',
      values: ['bindtest', 'bindtest@example.com']
    });
  },
  'allowed-columns': async () => {
    await client.query('SELECT * FROM users WHERE name = $1 AND email = $2', ['alloweduser', 'allowed@example.com']);
    await client.query('UPDATE users SET name = $1, email = $2 WHERE id = $3', ['updatedname', 'upd@example.com', 1]);
    return client.query('DELETE FROM users WHERE name = $1 AND email = $2', ['deleteuser', 'delete@example.com']);
  },
  'null-value': () => pool.query('SELECT * FROM users WHERE name = $1', [null]),
  'or-clause': () => client.query('SELECT * FROM users WHERE name = $1 OR name = $2', ['alice', 'bob']),
  binary: () => {
    const binaryData = Buffer.from('binary-payload');
    return client.query('UPDATE blobs SET data = $1 WHERE name = $2', [binaryData, 'testblob']);
  },
  unsupported: () => client.query('SELECT * FROM users WHERE name = $1', [{ key: 'value' }]),
  circular: () => {
    const circular = {};
    circular.self = circular;
    return client.query('SELECT * FROM users WHERE name = $1', [circular]);
  },
  'stored-procedure': () => client.query('SELECT * FROM get_user_by_name($1)', ['proceduretest']),
  'qualified-col': () => client.query('SELECT * FROM orders WHERE orders.id = $1', [42]),
  'qualified-entry-no-match': () => client.query('SELECT * FROM users WHERE id = $1', [99]),
  cap: () => {
    const conditions = Array.from({ length: 150 }, (_, i) => {
      const col = i < 100 && i % 2 !== 0 ? 'email' : 'name';
      return `${col} = $${i + 1}`;
    }).join(' OR ');
    const values = Array.from({ length: 150 }, (_, i) => `val${i}`);
    return client.query(`SELECT * FROM users WHERE ${conditions}`, values);
  },
  'span-batching': async () => {
    client.query('SELECT * FROM users WHERE name = $1', ['first-query']);
    await client.query('SELECT * FROM users WHERE name = $1', ['last-query']);
  }
};

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

app.get('/bind-variables', async (req, res) => {
  const scenario = req.query.scenario;
  const handler = PG_QUERY_SCENARIOS[scenario];
  if (!handler) {
    return res.status(400).json({ error: `Unknown scenario: ${scenario}` });
  }
  const result = await handler();
  res.json({ success: true, rows: result && result.rows });
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
