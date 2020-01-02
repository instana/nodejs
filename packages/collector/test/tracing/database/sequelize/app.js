/* eslint-disable no-console */

'use strict';

require('../../../../')({
  agentPort: process.env.AGENT_PORT,
  level: 'warn',
  tracing: {
    enabled: process.env.TRACING_ENABLED !== 'false',
    forceTransmissionStartingAt: 1
  }
});

const Sequelize = require('sequelize');
const sequelize = new Sequelize(process.env.POSTGRES_DB, process.env.POSTGRES_USER, process.env.POSTGRES_PASSWORD, {
  host: process.env.POSTGRES_HOST,
  dialect: 'postgres',
  operatorsAliases: false,
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
});

const express = require('express');
const morgan = require('morgan');
const bodyParser = require('body-parser');

const app = express();
const logPrefix = `Express/Postgres/Sequelize App (${process.pid}):\t`;
let ready = false;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => {
  if (ready) {
    res.sendStatus(200);
  } else {
    res.sendStatus(503);
  }
});

const Regent = sequelize.define('regent', {
  firstName: Sequelize.STRING,
  lastName: Sequelize.STRING
});

Regent.sync({ force: true }).then(() =>
  Regent.create({
    firstName: 'Irene',
    lastName: 'Sarantapechaina'
  }).then(() => {
    ready = true;
  })
);

app.get('/regents', (req, res) => {
  const where = req.query ? req.query : {};
  Regent.findAll({ attributes: ['firstName', 'lastName'], where })
    .then(regents => {
      res.send(regents.map(regent => regent.get()));
    })
    .catch(err => {
      res.status(500).send(err);
    });
});

app.post('/regents', (req, res) =>
  Regent.findOrCreate({
    where: {
      firstName: req.body.firstName,
      lastName: req.body.lastName
    },
    defaults: {
      firstName: req.body.firstName,
      lastName: req.body.lastName
    }
  })
    .then(() => {
      res.sendStatus(201);
    })
    .catch(err => {
      res.status(500).send(err);
    })
);

app.listen(process.env.APP_PORT, () => {
  log(`Listening on port: ${process.env.APP_PORT}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
