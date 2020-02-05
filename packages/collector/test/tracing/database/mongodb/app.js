/* eslint-disable no-console */
/* global Promise */

'use strict';

const agentPort = process.env.AGENT_PORT;

require('../../../../')({
  agentPort,
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

MongoClient.connect(`mongodb://${process.env.MONGODB}/myproject`, (err, client) => {
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
  let mongoResponse = null;
  collection
    .findOne(req.body)
    .then(r => {
      mongoResponse = r;
      // add an artificial delay and let the test start another HTTP entry, then make sure it is not put into the
      // currently active trace.
      return new Promise(resolve => {
        setTimeout(resolve, 500);
      });
    })
    .then(() =>
      // Execute another traced call to verify that we keep the tracing context.
      request(`http://127.0.0.1:${agentPort}?param=${req.body.param}`)
    )
    .then(() => res.json(mongoResponse))
    .catch(e => {
      log('Failed to find document', e);
      res.sendStatus(500);
    });
});

app.get('/findall', (req, res) => {
  let filter = {};
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
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
