/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

/* eslint-disable no-console */

'use strict';

require('../../../../')();

const express = require('express');
const morgan = require('morgan');
const bodyParser = require('body-parser');

const app = express();
const logPrefix = `Bookshelf App (${process.pid}):\t`;

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

(async () => {
  const result = await bookshelf.knex.schema.hasTable('users');

  if (!result) {
    bookshelf.knex.schema.createTableIfNotExists('users', function (t) {
      t.increments('id');
      t.string('name');
    });
  }
})();

const BookShelfUser = bookshelf.model('User', {
  tableName: 'users'
});

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.sendStatus(200);
});

app.get('/find-one', async (req, res) => {
  await new BookShelfUser({ name: 'parapeter' }).fetch({ require: false });
  res.json();
});

app.listen(process.env.APP_PORT, () => {
  log(`Listening on port: ${process.env.APP_PORT}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
