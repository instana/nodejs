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

require('@instana/collector')({
  instrumentations: ['@opentelemetry/instrumentation-knex']
});

const port = require('../../test_util/app-port')();
const express = require('express');

const knex = require('knex')({
  client: 'pg',
  connection: {
    user: process.env.POSTGRES_USER,
    host: process.env.POSTGRES_HOST,
    database: process.env.POSTGRES_DB,
    password: process.env.POSTGRES_PASSWORD,
    port: 5432
  }
});

const app = express();
app.use(express.json());

let connected = false;
knex.schema
  .hasTable('users')
  .then(exists => {
    if (!exists) {
      return knex.schema.createTable('users', table => {
        table.increments('id').primary();
        table.string('name');
        table.string('email');
      });
    }
  })
  .then(() => {
    connected = true;
    console.log('Table created or already exists');
  })
  .catch(err => {
    console.error('Error creating table:', err);
  });
app.get('/', (req, res) => {
  if (!connected) {
    res.sendStatus(500);
  }
  res.sendStatus(200);
});
app.post('/users', async (req, res) => {
  const { name, email } = req.body;
  const [id] = await knex('users').insert({ name, email }).returning('id');
  res.status(201).json({ id });
});
app.get('/users', async (req, res) => {
  const users = await knex('users').select('*');
  res.status(200).json(users);
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
