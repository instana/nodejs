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
const logPrefix = `Express / Postgres App (${process.pid}):\t`;

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
app.get('/sequelize-select', async (req, res) => {
  await sequelize.models.User.findOne({
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

app.listen(process.env.APP_PORT, () => {
  log(`Listening on port: ${process.env.APP_PORT}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
