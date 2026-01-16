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

app.post('/find-one', (req, res) => {
  let mongoResponse = null;
  collection
    .findOne(req.body)
    .then(r => {
      mongoResponse = r;
      // Execute another traced call to verify that we keep the tracing context.
      return fetch(`http://127.0.0.1:${agentPort}/ping`);
    })
    .then(() => {
      res.json(mongoResponse);
    })
    .catch(e => {
      log('Failed to find document', e);
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
      return fetch(`http://127.0.0.1:${agentPort}/ping`);
    })
    .then(() => {
      res.json(mongoResponse || {});
    })
    .catch(e => {
      log('Failed to updateOne', e);
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
      return fetch(`http://127.0.0.1:${agentPort}/ping`);
    })
    .then(() => {
      res.json(mongoResponse || {});
    })
    .catch(e => {
      log('Failed to replaceOne', e);
      res.sendStatus(500);
    });
});

app.post('/delete-one', (req, res) => {
  let mongoResponse = null;
  const filter = req.body && req.body.filter ? req.body.filter : { toDelete: true };
  collection
    .deleteOne(filter)
    .then(r => {
      mongoResponse = r;
      // Execute another traced call to verify that we keep the tracing context.
      return fetch(`http://127.0.0.1:${agentPort}/ping`);
    })
    .then(() => {
      res.json(mongoResponse || {});
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

app.post('/count', (req, res) => {
  collection
    .count(req.body)
    .then(r => {
      res.json(r);
    })
    .catch(e => {
      log('Failed to count', e);
      res.sendStatus(500);
    });
});

app.get('/find-forEach', (req, res) => {
  const results = [];
  collection
    .find({ foo: 'bar' })
    .forEach(doc => {
      results.push(doc);
    })
    .then(() => {
      res.json(results);
    })
    .catch(e => {
      log('Failed to find with forEach', e);
      res.sendStatus(500);
    });
});

app.get('/find-next', (req, res) => {
  const results = [];
  const cursor = collection.find({ foo: 'bar' });
  const iterate = async () => {
    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      if (doc) {
        results.push(doc);
      }
    }
    res.json(results);
  };
  iterate().catch(e => {
    log('Failed to find with next/hasNext', e);
    res.sendStatus(500);
  });
});

app.get('/find-stream', (req, res) => {
  const results = [];
  const stream = collection.find({ foo: 'bar' }).stream();
  stream.on('data', doc => {
    results.push(doc);
  });
  stream.on('end', () => {
    res.json(results);
  });
  stream.on('error', e => {
    log('Failed to find with stream', e);
    res.sendStatus(500);
  });
});

app.get('/find-async-iteration', async (req, res) => {
  try {
    const results = [];
    const cursor = collection.find({ foo: 'bar' });
    for await (const doc of cursor) {
      results.push(doc);
    }
    res.json(results);
  } catch (e) {
    log('Failed to find with async iteration', e);
    res.sendStatus(500);
  }
});

app.get('/aggregate-forEach', (req, res) => {
  const results = [];
  collection
    .aggregate([{ $match: { foo: 'bar' } }])
    .forEach(doc => {
      results.push(doc);
    })
    .then(() => {
      res.json(results);
    })
    .catch(e => {
      log('Failed to aggregate with forEach', e);
      res.sendStatus(500);
    });
});

// Route to reproduce async context loss in connection pool wait queue
// This route makes multiple parallel MongoDB queries to exhaust the connection pool,
// then makes additional queries that will go through the wait queue and lose async context
app.get('/reproduce-wait-queue', (req, res) => {
  // First, exhaust the connection pool with parallel queries
  // Default maxPoolSize is usually 10, so we make 15 parallel queries
  const poolExhaustingQueries = Array.from({ length: 15 }, (_, i) =>
    collection.findOne({ test: `exhaust-${i}` }).catch(() => null)
  );

  // Start all queries in parallel - they will use up available connections
  const exhaustPromises = Promise.all(poolExhaustingQueries);

  // Immediately after, make another query that will likely go through wait queue
  // This query should lose async context because it goes through process.nextTick()
  const waitQueueQuery = collection.findOne({ foo: 'bar' });

  // Wait for both
  Promise.all([exhaustPromises, waitQueueQuery])
    .then(() => {
      res.json({ status: 'ok', message: 'Check if MongoDB span was created for waitQueueQuery' });
    })
    .catch(e => {
      log('Failed to reproduce wait queue issue', e);
      res.sendStatus(500);
    });
});

// Route to simulate etna-mongo custom wrapper scenario
// Simulates the issue where client.db is wrapped and might lose async context
app.get('/reproduce-etna-mongo', (req, res) => {
  // Simulate etna-mongo behavior: lazy load mongodb and create client in async context
  // Important: Use lazy loading to allow instrumentation of mongodb
  const mongodbModule = require('mongodb');

  // Simulate _tryConnect: create client in a separate async context
  const connectClient = async () => {
    const wrappedClient = await mongodbModule.MongoClient.connect(connectString);
    const dbFunc = wrappedClient.db;

    // Make mongodb driver 3.3 compatible with 2.2 api (like etna-mongo does)
    // Do not change the prototype to avoid potential conflicts
    wrappedClient.db = name => {
      const wrappedDb = dbFunc.call(wrappedClient, name);
      if (wrappedDb) {
        // Simulate deprecated wrapper (like etna-mongo)
        const deprecated = (client, method) => {
          return (...args) => {
            if (client[method] == null) {
              throw Error(`MongoClient does not define a method '${method}'`);
            }
            return client[method].apply(client, args);
          };
        };
        ['logout', 'close', 'db'].forEach(m => {
          wrappedDb[m] = deprecated(wrappedClient, m);
        });
      }
      return wrappedDb;
    };
    return { client: wrappedClient };
  };

  // Create client in separate async context (simulating etna-mongo pattern)
  connectClient()
    .then(dbHandle => {
      const wrappedClient = dbHandle.client;
      const wrappedDb = wrappedClient.db('myproject');
      const wrappedCollection = wrappedDb.collection('mydocs');

      // Now use the wrapped collection - this might lose async context
      // because client was created outside of HTTP request context
      return wrappedCollection.findOne({ foo: 'bar' });
    })
    .then(result => {
      res.json({ status: 'ok', result, message: 'Check if MongoDB span was created for wrappedCollection query' });
    })
    .catch(e => {
      log('Failed to reproduce etna-mongo issue', e);
      res.sendStatus(500);
    });
});

// Route to simulate background MongoDB queries after HTTP response is sent
// This simulates the scenario where:
// - 401: MongoDB query completes BEFORE response is sent → span created
// - 200/403/503: Response is sent, then MongoDB query runs in background → no span (parent span already transmitted)
app.get('/reproduce-background-query', (req, res) => {
  // Send response immediately (like 200/403/503 would do)
  res.status(200).json({ status: 'ok', message: 'Response sent, MongoDB query running in background' });

  // MongoDB query runs AFTER response is sent (background)
  // HTTP Entry Span might already be transmitted, so skipExitTracing() finds no parent span
  setTimeout(() => {
    collection
      .findOne({ foo: 'bar' })
      .then(() => {
        log('Background MongoDB query completed');
      })
      .catch(e => {
        log('Background MongoDB query failed', e);
      });
  }, 50);
});

// Route to simulate 401 scenario: MongoDB query completes BEFORE response
app.get('/reproduce-401-scenario', (req, res) => {
  // MongoDB query runs FIRST (like auth check for 401)
  collection
    .findOne({ foo: 'bar' })
    .then(result => {
      // Query completes, HTTP Entry Span is still active
      // Now send response (401)
      res.status(401).json({ status: 'unauthorized', result });
    })
    .catch(e => {
      log('MongoDB query failed', e);
      res.sendStatus(500);
    });
});

app.post('/long-find', (req, res) => {
  const call = req.query.call;
  const unique = req.query.unique;
  if (!call || !unique) {
    log('Query parameters call and unique must be provided.');
    res.sendStatus(500);
    return;
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
    .then(() => {
      // Execute another traced call to verify that we keep the tracing context.
      return fetch(`http://127.0.0.1:${agentPort}/ping?call=${call}`);
    })
    .then(() => {
      res.json(mongoResponse || {});
    })
    .catch(e => {
      log('Failed to long-find', e);
      res.sendStatus(500);
    });
});

app.get('/findall', async (req, res) => {
  const filter = {};
  const findOpts = {};
  findOpts.batchSize = 2;
  findOpts.limit = 10;

  // NOTE: filter by property "unique"
  if (req.query && req.query.unique) {
    filter.unique = req.query.unique;
  }

  try {
    const resp = await collection.find(filter, findOpts).toArray();
    await fetch(`http://127.0.0.1:${agentPort}/ping`);
    res.json(resp);
  } catch (e) {
    log('Failed to findall', e);
    res.sendStatus(500);
  }
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
