/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

/* eslint-disable no-console */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('@instana/core/test/test_util/loadExpressV4');

require('../../../..')();
const express = require('express');
const morgan = require('morgan');
const bodyParser = require('body-parser');
const port = require('../../../test_util/app-port')();
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

let connected = false;

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

  connected = true;
})();

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => {
  if (!connected) return res.sendStatus(500);
  res.sendStatus(200);
});

app.get('/find-one', async (req, res) => {
  await sequelize.models.User.findOne({
    where: {
      name: 'parapeter'
    },
    attributes: ['name']
  });

  res.json({});
});

app.get('/raw', async (req, res) => {
  await sequelize.query('SELECT "name" FROM "User" AS "User" WHERE "User"."name" = $1 LIMIT 1;', {
    raw: true,
    nest: true,
    bind: ['parapeter']
  });

  res.json({});
});

app.get('/insert', async (req, res) => {
  await sequelize.models.User.create(
    {
      name: 'paramo'
    },
    { fields: ['name'] }
  );

  res.json({});
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
