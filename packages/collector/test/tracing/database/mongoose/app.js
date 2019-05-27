/* eslint-disable no-console */

'use strict';

require('../../../../')({
  agentPort: process.env.AGENT_PORT,
  level: 'warn',
  tracing: {
    forceTransmissionStartingAt: 1
  }
});

const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const express = require('express');
const morgan = require('morgan');

const app = express();
const logPrefix = `Express / Mongoose App (${process.pid}):\t`;
let connectedToMongo = false;

mongoose.Promise = global.Promise;

mongoose.model(
  'Person',
  new mongoose.Schema({
    name: String,
    age: Number
  })
);
const Person = mongoose.model('Person');

mongoose.connect(`mongodb://${process.env.MONGODB}/mongoose`, err => {
  if (err) {
    log('Failed to connect to Mongodb', err);
    process.exit(1);
  }
  connectedToMongo = true;
});

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => {
  if (!connectedToMongo) {
    res.sendStatus(500);
  } else {
    res.sendStatus(200);
  }
});

app.post('/insert', (req, res) => {
  Person.create(req.body)
    .then(r => {
      res.json(r);
    })
    .catch(e => {
      log('Failed to write document', e);
      res.sendStatus(500);
    });
});

app.post('/find', (req, res) => {
  Person.findOne(req.body)
    .exec()
    .then(r => {
      res.json(r);
    })
    .catch(e => {
      log('Failed to find document', e);
      res.sendStatus(500);
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
