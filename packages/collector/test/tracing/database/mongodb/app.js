/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. 2016
 */

'use strict';

const agentPort = process.env.INSTANA_AGENT_PORT;

require('../../../../')({
  level: 'warn',
  tracing: {
    enabled: process.env.TRACING_ENABLED !== 'false',
    forceTransmissionStartingAt: 1
  }
});

const MongoClient = require('mongodb').MongoClient;
const bodyParser = require('body-parser');
const express = require('express');
const morgan = require('morgan');
const assert = require('assert');
const request = require('request-promise');

const app = express();
let db;
let collection;
const logPrefix = `Express / MongoDB App (${process.pid}):\t`;

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

MongoClient.connect(connectString, (err, client) => {
  assert.equal(null, err);
  if (client.constructor.name === 'Db') {
    // mongodb versions < 3.x
    db = client;
  } else if (client.constructor.name === 'MongoClient') {
    // mongodb versions >= 3.x
    db = client.db();
  } else {
    throw new Error('Can not detect mongodb package version.');
  }
  collection = db.collection('mydocs');
  log('Connected to MongoDB');
});

app.get('/', (req, res) => {
  if (!db || !collection) {
    res.sendStatus(500);
  } else {
    res.sendStatus(200);
  }
});

app.post('/count', (req, res) => {
  collection.count(req.body, (err, mongoResponse) => {
    if (err) {
      log('Failed to count', err);
      res.sendStatus(500);
      return;
    }
    res.json(mongoResponse);
  });
});

app.post('/insert-one', (req, res) => {
  let mongoResponse = null;
  collection
    .insertOne(req.body)
    .then(r => {
      mongoResponse = r;
      // Execute another traced call to verify that we keep the tracing context.
      return request(`http://127.0.0.1:${agentPort}`);
    })
    .then(() => {
      res.json(mongoResponse);
    })
    .catch(e => {
      log('Failed to write document', e);
      res.sendStatus(500);
    });
});

app.post('/update-one', (req, res) => {
  let mongoResponse = null;
  collection
    .updateOne(req.body.filter, req.body.update)
    .then(r => {
      mongoResponse = r;
      // Execute another traced call to verify that we keep the tracing context.
      return request(`http://127.0.0.1:${agentPort}`);
    })
    .then(() => {
      res.json(mongoResponse);
    })
    .catch(e => {
      log('Failed to update document', e);
      res.sendStatus(500);
    });
});

app.post('/replace-one', (req, res) => {
  let mongoResponse = null;
  collection
    .replaceOne(req.body.filter, req.body.doc)
    .then(r => {
      mongoResponse = r;
      // Execute another traced call to verify that we keep the tracing context.
      return request(`http://127.0.0.1:${agentPort}`);
    })
    .then(() => {
      res.json(mongoResponse);
    })
    .catch(e => {
      log('Failed to replace document', e);
      res.sendStatus(500);
    });
});

app.post('/delete-one', (req, res) => {
  let mongoResponse = null;
  collection
    .deleteOne(req.body.filter)
    .then(r => {
      mongoResponse = r;
      // Execute another traced call to verify that we keep the tracing context.
      return request(`http://127.0.0.1:${agentPort}`);
    })
    .then(() => {
      res.json(mongoResponse);
    })
    .catch(e => {
      log('Failed to delete document', e);
      res.sendStatus(500);
    });
});

app.get('/find-one', (req, res) => {
  let mongoResponse = null;
  collection
    .findOne(req.body)
    .then(r => {
      mongoResponse = r;
      // Execute another traced call to verify that we keep the tracing context.
      return request(`http://127.0.0.1:${agentPort}`);
    })
    .then(() => {
      res.json(mongoResponse);
    })
    .catch(e => {
      log('Failed to find document', e);
      res.sendStatus(500);
    });
});

// An operation with an artificial delay to check that we do not by mistake inject other incoming http entries into the
// current trace.
app.post('/long-find', (req, res) => {
  const call = req.query.call;
  const unique = req.query.unique;
  if (!call || !unique) {
    log('Query parameters call and unique must be provided.');
    res.sendStatus(500);
  }

  const startedAt = Date.now();
  let mongoResponse = null;

  const array = Array.from(Array(10000).keys());
  const sequencePromise = array.reduce(
    previousPromise =>
      previousPromise.then(() => {
        if (Date.now() > startedAt + 1500) {
          return Promise.resolve();
        } else {
          return collection.findOne({ unique }).then(r => {
            mongoResponse = r;
          });
        }
      }),
    Promise.resolve()
  );

  return sequencePromise
    .then(r => {
      mongoResponse = r;
      // Execute another traced call to verify that we keep the tracing context.
      return request(`http://127.0.0.1:${agentPort}?call=${call}`);
    })
    .then(() => res.json(mongoResponse))
    .catch(e => {
      log('Failed to find document', e);
      res.sendStatus(500);
    });
});

app.get('/findall', (req, res) => {
  const filter = {};
  if (req.query && req.query.unique) {
    filter.unique = req.query.unique;
  }
  collection
    .find(filter)
    .batchSize(2)
    .toArray((err, docs) => {
      if (err) {
        res.status(500).json(err);
      } else {
        // Execute another traced call to verify that we keep the tracing context.
        return request(`http://127.0.0.1:${agentPort}`)
          .then(() => {
            res.json(docs);
          })
          .catch(err2 => {
            res.status(500).json(err2);
          });
      }
    });
});

app.listen(process.env.APP_PORT, () => {
  log(`Listening on port: ${process.env.APP_PORT}`);
});

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
