/* eslint-disable no-console */

'use strict';

require('../../../../')();

const Client = require('pg-native');
const express = require('express');
const morgan = require('morgan');
const bodyParser = require('body-parser');

const app = express();
const logPrefix = `Express / Postgres App (${process.pid}):\t`;
let connected = false;

const client = new Client();
client.connect(
  `host=${process.env.POSTGRES_HOST || 'localhost'} port=5432 dbname=${process.env.POSTGRES_DB} user=${
    process.env.POSTGRES_USER
  } password=${process.env.POSTGRES_PASSWORD}`,
  err => {
    if (err) {
      return log('Cannot connect to PostgreSQL database', err);
    }

    const createTableQuery =
      'CREATE TABLE IF NOT EXISTS users(id serial primary key, name varchar(40) NOT NULL, email varchar(40) NOT NULL)';

    client.query(createTableQuery, createErr => {
      if (createErr) {
        log('Failed create table query', createErr);
      }
      connected = true;
    });
  }
);

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => {
  if (connected) {
    return res.sendStatus(200);
  }
  return res.sendStatus(500);
});

app.post('/select', (req, res) => {
  client.query('SELECT NOW()', (err, results) => {
    if (err) {
      log('Failed to execute select now query', err);
      return res.sendStatus(500);
    }
    res.json(results);
  });
});

app.post('/select-sync', (req, res) => {
  const results = client.querySync('SELECT NOW()');
  res.json(results);
});

app.post('/insert', (req, res) => {
  const insert = 'INSERT INTO users(name, email) VALUES($1, $2) RETURNING *';
  const values = ['beaker', 'beaker@muppets.com'];

  client.query(insert, values, (err, results) => {
    if (err) {
      log('Failed to execute client insert', err);
      return res.sendStatus(500);
    }
    res.json(results);
  });
});

app.post('/error', (req, res) => {
  client.query('SELECT name, email FROM nonexistanttable', (err, results) => {
    if (err) {
      return res.status(500).json({ error: err.toString() });
    }
    res.json(results);
  });
});

app.post('/error-sync', (req, res) => {
  try {
    const results = client.querySync('SELECT name, email FROM nonexistanttable');
    return res.json(results);
  } catch (err) {
    return res.status(500).json({ error: err.toString() });
  }
});

app.post('/prepared-statement', (req, res) => {
  client.prepare('statement-name', 'INSERT INTO users(name, email) VALUES($1, $2) RETURNING *', 2, e1 => {
    if (e1) {
      log('Could not prepare statement', e1);
      return res.sendStatus(500);
    }
    client.execute('statement-name', ['gonzo', 'gonzo@muppets.com'], (e2, results) => {
      if (e2) {
        log('Failed to execute prepared statement', e2);
        return res.sendStatus(500);
      }
      res.json(results);
    });
  });
});

app.post('/prepared-statement-sync', (req, res) => {
  client.prepareSync('statement-name', 'INSERT INTO users(name, email) VALUES($1, $2) RETURNING *', 2);
  const results = client.executeSync('statement-name', ['scooter', 'scooter@muppets.com']);
  res.json(results);
});

app.post('/transaction', (req, res) => {
  client.query('BEGIN', err1 => {
    if (err1) {
      log('Failed to BEGIN a transaction', err1);
      return res.status(500).json(err1);
    }

    client.query(
      'INSERT INTO users(name, email) VALUES($1, $2) RETURNING *',
      ['fozzie', 'fozzie@muppets.com'],
      err2 => {
        if (err2) {
          log('Failed to execute query in transaction', err2);
          return res.status(500).json(err2);
        }
        client.query(
          'INSERT INTO users(name, email) VALUES($1, $2) RETURNING *',
          ['animal', 'animal@muppets.com'],
          (err3, result3) => {
            if (err3) {
              log('Failed to execute query in transaction', err3);
              return res.status(500).json(err3);
            }
            client.query('COMMIT', err4 => {
              if (err4) {
                log('Failed to COMMIT transaction', err4);
                return res.status(500).json(err4);
              }
              return res.json(result3);
            });
          }
        );
      }
    );
  });
});

app.post('/cancel', (req, res) => {
  let hasBeenCancelled = false;
  setTimeout(() => {
    client.cancel(err => {
      if (err) {
        log('Failed to cancel query', err);
        return res.status(500).json(err);
      }
      hasBeenCancelled = true;
    });
  }, 500);
  client.query('SELECT NOW() FROM pg_sleep(1)', (err2, results) => {
    if (err2 && err2.toString().indexOf('canceling') >= 0) {
      // We want to verify that the cancel callback is called but pg-native actually calls it after the query callback
      // is called. So we wait a few milliseconds more and only then send the response - by then, the cancel callback
      // will have been called, too, and hasBeenCancelled has the correct value.
      setTimeout(() => {
        return res.json({ results, hasBeenCancelled });
      }, 100);
    } else if (err2) {
      log('Failed to execute query', err2);
      return res.sendStatus(500);
    } else {
      return res.json({ results, hasBeenCancelled });
    }
  });
});

app.listen(process.env.APP_PORT, () => {
  log(`Listening on port: ${process.env.APP_PORT}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
