/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

/* eslint-disable no-console */

'use strict';

const agentPort = process.env.INSTANA_AGENT_PORT;

require('../../../../')();

const _pg = require('pg');
const Pool = _pg.Pool;
const Client = _pg.Client;
const express = require('express');
const morgan = require('morgan');
const request = require('request-promise-native');
const bodyParser = require('body-parser');

const app = express();
const logPrefix = `Express / Postgres App (${process.pid}):\t`;
const pool = new Pool({
  user: process.env.POSTGRES_USER,
  host: process.env.POSTGRES_HOST,
  database: process.env.POSTGRES_DB,
  password: process.env.POSTGRES_PASSWORD
});
const client = new Client({
  user: process.env.POSTGRES_USER,
  host: process.env.POSTGRES_HOST,
  database: process.env.POSTGRES_DB,
  password: process.env.POSTGRES_PASSWORD
});
client.connect();

const createTableQuery =
  'CREATE TABLE IF NOT EXISTS users(id serial primary key, name varchar(40) NOT NULL, email varchar(40) NOT NULL)';

pool.query(createTableQuery, err => {
  if (err) {
    log('Failed create table query', err);
  }
});

const { Sequelize, DataTypes } = require('sequelize');
const sequelize = new Sequelize(
  `postgres://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST}:5432/${process.env.POSTGRES_DB}`
);

(async () => {
  const User = sequelize.define(
    'User',
    {
      // Model attributes are defined here
      firstName: {
        type: DataTypes.STRING,
        allowNull: false
      },
      lastName: {
        type: DataTypes.STRING
        // allowNull defaults to true
      }
    },
    {
      freezeTableName: true
    }
  );

  await User.sync({ force: true });

  await User.create(
    {
      firstName: 'alice123'
    },
    { fields: ['firstName'] }
  );
})();

const knex = require('knex')({
  client: 'pg',
  connection: {
    host: process.env.POSTGRES_HOST,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB,
    charset: 'utf8'
  }
});
const bookshelf = require('bookshelf')(knex);

// Defining models
const BookShelfUser = bookshelf.model('User', {
  tableName: 'users'
});

const typeorm = require('typeorm');

class UserTypeOrm {
  constructor(id, firstName) {
    this.id = id;
    this.firstName = firstName;
  }
}

const EntitySchema = require('typeorm').EntitySchema;

const UserTypeOrmEntity = new EntitySchema({
  name: 'User',
  target: UserTypeOrm,
  columns: {
    id: {
      primary: true,
      type: 'int',
      generated: true
    },
    firstName: {
      type: 'varchar'
    }
  }
});

let typeormconnection;

(async () => {
  typeorm
    .createConnection({
      type: 'postgres',
      host: process.env.POSTGRES_HOST,
      username: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      database: process.env.POSTGRES_DB,
      synchronize: true,
      logging: false,
      entities: [UserTypeOrmEntity]
    })
    .then(connection => {
      console.log('CONNECTION ESTABLISHED');
      typeormconnection = connection;
    });
})();

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
    request(`http://127.0.0.1:${agentPort}`).then(() => {
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
    request(`http://127.0.0.1:${agentPort}`).then(() => {
      res.json(results);
    });
  });
});

app.get('/select-now-no-pool-promise', (req, res) => {
  client
    .query('SELECT NOW()')
    .then(results => {
      request(`http://127.0.0.1:${agentPort}`).then(() => {
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

/**
 * https://github.com/sequelize/sequelize/pull/9431
 * Sequilize does not support it yet, just for inserts and raw queries
 */
app.get('/sequelize', async (req, res) => {
  const result = await sequelize.models.User.findOne({
    // plain: true,
    where: {
      firstName: 'alice123'
    },
    bind: {}
  });

  res.json();
});
app.get('/sequelize-insert', async (req, res) => {
  await sequelize.models.User.create(
    {
      firstName: 'xxx'
    },
    { fields: ['firstName'] }
  );

  res.json();
});
app.get('/bookshelf-select', async (req, res) => {
  new BookShelfUser({ id: 1 })
    .fetch()
    .then(user => {
      console.log(user);
      res.json();
    })
    .catch(error => {
      res.json();
    });
});
app.get('/typeorm-select', async (req, res) => {
  const repo = typeormconnection.getRepository(UserTypeOrm);
  const user = await repo.findOne({ id: 1 });

  res.json();
});

app.get('/pg-where', async (req, res) => {
  client.query('SELECT * FROM users WHERE name = $1', ['trans1'], (err, results) => {
    console.log(err);
    res.json();
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
    request(`http://127.0.0.1:${agentPort}`).then(() => {
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
    request(`http://127.0.0.1:${agentPort}`).then(() => {
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
      request(`http://127.0.0.1:${agentPort}`).then(() => {
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
    request(`http://127.0.0.1:${agentPort}`).then(() => {
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
    request(`http://127.0.0.1:${agentPort}`).then(() => {
      res.json(results);
    });
  });
});

app.get('/table-doesnt-exist', (req, res) => {
  pool
    .query('SELECT name, email FROM nonexistanttable')
    .then(r => res.json(r))
    .catch(e => {
      request(`http://127.0.0.1:${agentPort}`).then(() => {
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
          request(`http://127.0.0.1:${agentPort}`).then(() => res.json(result3));
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

app.listen(process.env.APP_PORT, () => {
  log(`Listening on port: ${process.env.APP_PORT}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
