/* eslint-disable no-console */

'use strict';

require('../../../../')({
  agentPort: process.env.AGENT_PORT,
  level: 'warn',
  tracing: {
    enabled: process.env.TRACING_ENABLED === 'true',
    forceTransmissionStartingAt: 1
  }
});

var Sequelize = require('sequelize');
var sequelize = new Sequelize(process.env.POSTGRES_DB, process.env.POSTGRES_USER, process.env.POSTGRES_PASSWORD, {
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

var express = require('express');
var morgan = require('morgan');
var bodyParser = require('body-parser');

var app = express();
var logPrefix = 'Express/Postgres/Sequelize App (' + process.pid + '):\t';
var ready = false;

if (process.env.WITH_STDOUT) {
  app.use(morgan(logPrefix + ':method :url :status'));
}

app.use(bodyParser.json());

app.get('/', function(req, res) {
  if (ready) {
    res.sendStatus(200);
  } else {
    res.sendStatus(503);
  }
});

var Regent = sequelize.define('regent', {
  firstName: Sequelize.STRING,
  lastName: Sequelize.STRING
});

Regent.sync({ force: true }).then(function() {
  return Regent.create({
    firstName: 'Irene',
    lastName: 'Sarantapechaina'
  }).then(function() {
    ready = true;
  });
});

app.get('/regents', function(req, res) {
  var where = req.query ? req.query : {};
  // Regent.findOne({ attributes: ['firstName', 'lastName'], where: where })
  //   .then(function(regent) {
  //     res.send([regent.get()]);
  //   })
  //   .catch(function(err) {
  //     res.status(500).send(err);
  //   });
  Regent.findAll({ attributes: ['firstName', 'lastName'], where: where })
    .then(function(regents) {
      res.send(
        regents.map(function(regent) {
          return regent.get();
        })
      );
    })
    .catch(function(err) {
      res.status(500).send(err);
    });
});

app.post('/regents', function(req, res) {
  return Regent.findOrCreate({
    where: {
      firstName: req.body.firstName,
      lastName: req.body.lastName
    },
    defaults: {
      firstName: req.body.firstName,
      lastName: req.body.lastName
    }
  })
    .then(function() {
      res.sendStatus(201);
    })
    .catch(function(err) {
      res.status(500).send(err);
    });
});

app.listen(process.env.APP_PORT, function() {
  log('Listening on port: ' + process.env.APP_PORT);
});

function log() {
  var args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
