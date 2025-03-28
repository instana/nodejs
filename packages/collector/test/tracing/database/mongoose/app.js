/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('./mockVersion');
require('@instana/core/test/test_util/mockRequireExpress');

require('../../../..')();

const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const express = require('express');
const morgan = require('morgan');
const { v4: uuid } = require('uuid');
const port = require('../../../test_util/app-port')();

const app = express();
const logPrefix = `Express / Mongoose App (${process.pid}):\t`;
let connectedToMongo = false;

mongoose.Promise = global.Promise;

const ATLAS_CLUSTER = process.env.ATLAS_CLUSTER;
const ATLAS_USER = process.env.ATLAS_USER || '';
const ATLAS_PASSWORD = process.env.ATLAS_PASSWORD || '';
const USE_ATLAS = process.env.USE_ATLAS === 'true';

const isLatestMajor = process.env.MONGOOSE_VERSION === 'latest' || process.env.MONGOOSE_VERSION === 'v854';

let connectString;
if (USE_ATLAS) {
  connectString = `mongodb+srv://${ATLAS_USER}:${ATLAS_PASSWORD}@${ATLAS_CLUSTER}/mongoose?retryWrites=true&w=majority`;
  log(`Using MongoDB Atlas: ${connectString}`);
} else {
  connectString = `mongodb://${process.env.MONGODB}/mongoose`;
  log(`Using local MongoDB: ${connectString}`);
}

mongoose.model(
  'Person',
  new mongoose.Schema({
    name: String,
    age: Number,
    status: String
  })
);
const Person = mongoose.model('Person');

if (isLatestMajor || process.env.MONGOOSE_VERSION === 'v7') {
  (async () => {
    try {
      await mongoose.connect(connectString);
      connectedToMongo = true;
    } catch (err) {
      log('Failed to connect to Mongodb', err);
      process.exit(1);
    }
  })();
} else {
  mongoose.connect(connectString, err => {
    if (err) {
      log('Failed to connect to Mongodb', err);
      process.exit(1);
    }
    connectedToMongo = true;
  });
}

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

app.post('/aggregate', (req, res) => {
  const status1 = uuid();
  const status2 = uuid();

  Promise.all([
    Person.create({
      name: uuid(),
      status: status1,
      age: 33
    }),
    Person.create({
      name: uuid(),
      status: status1,
      age: 33
    }),
    Person.create({
      name: uuid(),
      status: status1,
      age: 77
    }),
    Person.create({
      name: uuid(),
      status: status2,
      age: 89
    })
  ])
    .then(() =>
      Person.aggregate([
        {
          $match: { status: status1 }
        },
        {
          $group: {
            _id: '$age',
            totalCount: { $sum: 1 },
            totalAge: { $sum: '$age' }
          }
        },
        {
          $project: {
            _id: true,
            totalCount: true,
            totalAge: true
          }
        }
      ])
    )
    .then(r => {
      res.json(r);
    })
    .catch(e => {
      log('Create/aggregate failed', e);
      res.sendStatus(500);
    });
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
