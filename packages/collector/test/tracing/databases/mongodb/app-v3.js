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

const agentPort = process.env.INSTANA_AGENT_PORT;

require('../../../..')({
  level: 'warn',
  tracing: {
    enabled: process.env.TRACING_ENABLED !== 'false',
    forceTransmissionStartingAt: 1
  }
});

const mongodb = require('mongodb');
const path = require('path');
const assert = require('assert');

// typeorm in collector installs another mongodb version which is loaded here
// delete manuelly for now
assert(path.dirname(require.resolve('mongodb')) === path.join(__dirname, '../../../../../../node_modules/mongodb'));

const MongoClient = mongodb.MongoClient;
const bodyParser = require('body-parser');
const express = require('express');
const morgan = require('morgan');
const fetch = require('node-fetch-v2');
const port = require('../../../test_util/app-port')();

const app = express();
let db;
let collection;
const logPrefix = `Express / MongoDB App v3 (${process.pid}):\t`;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

const ATLAS_CLUSTER = process.env.ATLAS_CLUSTER;
const ATLAS_USER = process.env.ATLAS_USER || '';
const ATLAS_PASSWORD = process.env.ATLAS_PASSWORD || '';
const USE_ATLAS = process.env.USE_ATLAS === 'true';

let connectString;
if (USE_ATLAS) {
  connectString =
    //
    `mongodb+srv://${ATLAS_USER}:${ATLAS_PASSWORD}@${ATLAS_CLUSTER}/myproject?retryWrites=true&w=majority`;
  log(`Using MongoDB Atlas: ${connectString}`);
} else {
  connectString = `mongodb://${process.env.MONGODB}/myproject`;
  log(`Using local MongoDB: ${connectString}`);
}

(async () => {
  const client = new MongoClient(connectString);
  await client.connect();
  db = client.db('myproject');
  collection = db.collection('mydocs');

  const mongodb = require('mongodb');
  console.log('Same prototype?', Object.getPrototypeOf(collection) === mongodb.Collection.prototype);
  console.log('insertOne on prototype wrapped?', mongodb.Collection.prototype.insertOne?.name);
  console.log('insertOne on instance wrapped?', collection.insertOne?.name);
  console.log('Has own insertOne?', collection.hasOwnProperty('insertOne'));

  log('Connected to MongoDB');
})();

app.get('/', (req, res) => {
  if (!db || !collection) {
    res.sendStatus(500);
  } else {
    res.sendStatus(200);
  }
});

app.post('/insert-one', (req, res) => {
  let mongoResponse = null;
  collection
    .insertOne(req.body)
    .then(r => {
      mongoResponse = r;
      // Execute another traced call to verify that we keep the tracing context.
      return fetch(`http://127.0.0.1:${agentPort}/ping`);
    })
    .then(() => {
      res.json(mongoResponse);
    })
    .catch(e => {
      log('Failed to write document', e);
      res.sendStatus(500);
    });
});

app.post('/insert-one-callback', (req, res) => {
  collection.insertOne(req.body, (err, r) => {
    if (err) {
      log('Failed to write document', err);
      return res.sendStatus(500);
    }
    res.json(r);
  });
});

app.get('/find-one', (req, res) => {
  collection
    .findOne({ foo: 'bar' })
    .then(r => {
      res.json(r || {});
    })
    .catch(e => {
      log('Failed to find document', e);
      res.sendStatus(500);
    });
});

app.get('/find', (req, res) => {
  collection
    .find({ foo: 'bar' })
    .toArray()
    .then(r => {
      res.json(r);
    })
    .catch(e => {
      log('Failed to find documents', e);
      res.sendStatus(500);
    });
});

app.post('/find-one-and-update', (req, res) => {
  collection
    .findOneAndUpdate({ foo: 'bar' }, { $set: { updated: true } })
    .then(r => {
      res.json(r || {});
    })
    .catch(e => {
      log('Failed to findOneAndUpdate', e);
      res.sendStatus(500);
    });
});

app.post('/update-one', (req, res) => {
  collection
    .updateOne({ foo: 'bar' }, { $set: { updated: true } })
    .then(r => {
      res.json(r || {});
    })
    .catch(e => {
      log('Failed to updateOne', e);
      res.sendStatus(500);
    });
});

app.post('/delete-one', (req, res) => {
  collection
    .deleteOne({ toDelete: true })
    .then(r => {
      res.json(r || {});
    })
    .catch(e => {
      log('Failed to deleteOne', e);
      res.sendStatus(500);
    });
});

app.get('/aggregate', (req, res) => {
  collection
    .aggregate([{ $match: { foo: 'bar' } }])
    .toArray()
    .then(r => {
      res.json(r);
    })
    .catch(e => {
      log('Failed to aggregate', e);
      res.sendStatus(500);
    });
});

app.get('/count-documents', (req, res) => {
  collection
    .countDocuments({ foo: 'bar' })
    .then(r => {
      res.json({ count: r });
    })
    .catch(e => {
      log('Failed to countDocuments', e);
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
