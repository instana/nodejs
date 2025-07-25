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

const isLegacy = process.env.MONGODB_VERSION === 'v4';
const agentPort = process.env.INSTANA_AGENT_PORT;

process.env.INSTANA_LOG_LEVEL = 'warn';
process.env.INSTANA_TRACING_DISABLE = process.env.TRACING_ENABLED !== 'false';
process.env.INSTANA_FORCE_TRANSMISSION_STARTING_AT = 1;

import MongoClient from 'mongodb';
import bodyParser from 'body-parser';
import express from 'express';
import morgan from 'morgan';
import assert from 'assert';
import fetch from 'node-fetch';
import getAppPort from '../../../test_util/app-port.js';
const port = getAppPort();

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

if (process.env.USE_LEGACY_3_X_CONNECTION_MECHANISM) {
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
} else if (!isLegacy) {
  (async () => {
    const client = new MongoClient.MongoClient(connectString);
    await client.connect();
    db = client.db('myproject');
    collection = db.collection('mydocs');

    log('Connected to MongoDB');
  })();
} else {
  // mongodb versions >= 3.x, newer "unified" topology
  MongoClient.connect(connectString, { useUnifiedTopology: true }, (err, client) => {
    assert.equal(null, err);
    db = client.db();
    collection = db.collection('mydocs');
  });
}

app.get('/', (req, res) => {
  if (!db || !collection) {
    res.sendStatus(500);
  } else {
    res.sendStatus(200);
  }
});

app.post('/count', async (req, res) => {
  if (!isLegacy) {
    const mongoResponse = await collection.count(req.body);
    res.json(mongoResponse);
    return;
  }

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
      return fetch(`http://127.0.0.1:${agentPort}`);
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
      return fetch(`http://127.0.0.1:${agentPort}`);
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
      return fetch(`http://127.0.0.1:${agentPort}`);
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
      return fetch(`http://127.0.0.1:${agentPort}`);
    })
    .then(() => {
      res.json(mongoResponse);
    })
    .catch(e => {
      log('Failed to delete document', e);
      res.sendStatus(500);
    });
});

app.post('/find-one', (req, res) => {
  let mongoResponse = null;
  collection
    .findOne(req.body)
    .then(r => {
      mongoResponse = r;
      // Execute another traced call to verify that we keep the tracing context.
      return fetch(`http://127.0.0.1:${agentPort}`);
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
      return fetch(`http://127.0.0.1:${agentPort}?call=${call}`);
    })
    .then(() => res.json(mongoResponse || {}))
    .catch(e => {
      log('Failed to find document', e);
      res.sendStatus(500);
    });
});

app.get('/findall', async (req, res) => {
  const filter = {};

  if (!isLegacy) {
    const findOpts = {};
    findOpts.batchSize = 2;
    findOpts.limit = 10;

    if (req.query && req.query.unique) {
      filter.unique = req.query.unique;
    }

    const resp = await collection.find(filter, findOpts).toArray();
    await fetch(`http://127.0.0.1:${agentPort}`);
    res.json(resp);
    return;
  }

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
        return fetch(`http://127.0.0.1:${agentPort}`)
          .then(() => {
            res.json(docs);
          })
          .catch(err2 => {
            res.status(500).json(err2);
          });
      }
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
