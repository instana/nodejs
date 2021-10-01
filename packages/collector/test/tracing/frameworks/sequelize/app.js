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
const logPrefix = `Sequilize App (${process.pid}):\t`;

const { Sequelize, DataTypes } = require('sequelize');
const sequelize = new Sequelize({
  dialect: 'postgres',
  host: process.env.POSTGRES_HOST,
  username: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB
});

(async () => {
  const User = sequelize.define(
    'User',
    {
      name: {
        type: DataTypes.STRING
      }
    },
    {
      freezeTableName: true
    }
  );

  await User.sync({ force: true });

  await User.create(
    {
      name: 'parapeter'
    },
    { fields: ['name'] }
  );
})();

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.sendStatus(200);
});

/**
 * https://github.com/sequelize/sequelize/pull/9431
 * Sequilize does not support it yet, just for inserts and raw queries
 */
app.get('/find-one', async (req, res) => {
  await sequelize.models.User.findOne({
    where: {
      name: 'parapeter'
    },
    attributes: ['name'],
    bind: {}
  });

  res.json();
});

app.get('/insert', async (req, res) => {
  await sequelize.models.User.create(
    {
      name: 'paramo'
    },
    { fields: ['name'] }
  );

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
