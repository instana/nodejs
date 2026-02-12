/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('@instana/collector')();

const couchbase = require('couchbase');
const bodyParser = require('body-parser');
const express = require('express');
const uuid = require('uuid');
const morgan = require('morgan');
const port = require('@_local/collector/test/test_util/app-port')();
const { delay } = require('@_local/core/test/test_util');
const agentPort = process.env.INSTANA_AGENT_PORT;

let connected = false;
let connected2 = false;
let cluster;
let cluster2;
let bucketMng;

let bucket1;
let collection1;

let bucket2;
let scope2;
let collection2;

const indeParams = {
  doc_config: {},
  mapping: {},
  store: {}
};

// NOTE: we sometimes receive "failed to create index" 400 status code. No idea why.
// Restart & clean docker. Usually it works afterwards.
// We need all of the delays used below to avoid `index_not_ready`.
const upsertIndex = async (idxName, cb) => {
  const delayInMs = 500;
  const opts = {
    name: idxName,
    sourceName: bucket1.name,
    sourceType: 'couchbase',
    type: 'fulltext-index',
    params: indeParams
  };

  if (cb) {
    return cluster.searchIndexes().upsertIndex(opts, async err => {
      if (err) {
        await delay(delayInMs);
        return upsertIndex(idxName, cb);
      }

      await delay(delayInMs);
      return cb();
    });
  }

  try {
    await cluster.searchIndexes().upsertIndex(opts);
    await delay(delayInMs);
  } catch (err) {
    await delay(delayInMs);
    return upsertIndex(idxName);
  }
};

const bootstrapCluster = async () => {
  ['insert', 'get', 'getandtouch', 'lookup', 'mutate', 'replace', 'remove'].forEach(n => {
    new Array(3)
      .fill()
      .map((v, k) => k)
      .forEach(async i => {
        const key = `${n}-key-${i}`;

        try {
          await collection1.insert(key, { foo: 1, bar: 2 });
        } catch (collectionErr) {
          // ignore err
        }
      });
  });

  try {
    const result = await cluster.searchIndexes().getAllIndexes();

    result.forEach(async index => {
      await cluster.searchIndexes().dropIndex(index.name);
    });
  } catch (cleanupErr) {
    // ignore
  }
  try {
    const result = await cluster.queryIndexes().getAllIndexes(bucket1.name);

    result.forEach(async index => {
      await cluster.queryIndexes().dropIndex(bucket1.name, index.name);
    });
  } catch (cleanupErr) {
    // ignore
  }
  try {
    const result = await cluster.queryIndexes().getAllIndexes(bucket2.name);

    result.forEach(async index => {
      await cluster.queryIndexes().dropIndex(bucket2.name, index.name);
    });
  } catch (cleanupErr) {
    // ignore
  }
};

// NOTE: There is the option to connect with a bucket name couchbase://127.0.0.1/projects,
//       but the fn still returns the cluster and the instrumentation works. Manually tested.
couchbase.connect(
  process.env.COUCHBASE_CONN_STR_1,
  {
    username: 'node',
    password: 'nodepwd'
  },
  async (err, _cluster) => {
    if (err) throw err;

    log('Connected to couchbase 1. Bootstrapping...');

    cluster = _cluster;
    bucketMng = cluster.buckets();

    let retries = 0;
    const flushBuckets = async function () {
      // eslint-disable-next-line no-console
      console.log(`Flushing buckets (retries: ${retries})...`);

      try {
        await bucketMng.flushBucket('projects');
        await bucketMng.flushBucket('companies');

        // eslint-disable-next-line no-console
        console.log('Flushed buckets.');
      } catch (bucketErr) {
        // eslint-disable-next-line no-console
        console.log(`Flush buckets failed: ${bucketErr.message}`);

        if (retries > 3) {
          return;
        }
        // "Flush failed with unexpected error" protection
        await delay(1000);
        retries += 1;
        return flushBuckets();
      }
    };

    // clear all data
    await flushBuckets();

    // cluster.bucket calls `conn.openBucket`
    bucket1 = cluster.bucket('projects');
    bucket2 = cluster.bucket('companies');

    collection1 = bucket1.defaultCollection();

    // NOTE: Customer can create a custom scope and a custom collection
    //       I have manually tested this and it works as well
    //       _default is automatically created when creating a bucket.
    scope2 = bucket2.scope('_default');
    collection2 = scope2.collection('_default');

    await bootstrapCluster();

    log('Bootstrapping 1 done.');
    connected = true;
  }
);

// Second connection for testing multiple clients.
couchbase.connect(
  process.env.COUCHBASE_CONN_STR_2,
  {
    username: 'node',
    password: 'nodepwd'
  },
  async (err, _cluster) => {
    if (err) throw err;

    cluster2 = _cluster;
    connected2 = true;

    log('Connected to couchbase 2. Bootstrapping...');
    log('Bootstrapping 2 done.');
  }
);

const app = express();
const logPrefix = `Couchbase App (${process.pid}):\t`;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => {
  if (connected && connected2) return res.sendStatus(200);
  return res.sendStatus(500);
});

app.get('/get-promise', async (req, res) => {
  try {
    const result = await collection1.get('get-key-1');
    await fetch(`http://127.0.0.1:${agentPort}/ping`);

    res.json({ result: result.value });
  } catch (err) {
    res.status(500).json({ err: err.message });
  }
});

app.get('/get-callback', (req, res) => {
  collection1.get('get-key-2', (err, result) => {
    if (err) return res.status(500).send({ err: err.message });

    fetch(`http://127.0.0.1:${agentPort}/ping`)
      .then(() => {
        res.json({ result: result.value });
      })
      .catch(err1 => {
        res.status(500).json({ err: err1.message });
      });
  });
});

app.get('/get-buckets-promise', async (req, res) => {
  try {
    await collection1.get('get-key-1');
    await collection2.insert('insert-key-5', 'val');

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ err: err.message });
  }
});

app.get('/get-buckets-callback', (req, res) => {
  collection1.get('get-key-1', function (err1) {
    if (err1) return res.status(500).send({ err: err1.message });

    collection2.insert('insert-key-2', 'val', function (err2) {
      if (err2) return res.status(500).send({ err: err2.message });
      res.json({ success: true });
    });
  });
});

app.get('/exists-promise', async (req, res) => {
  try {
    const result = await collection1.exists('get-key-1');
    res.json({ result: result.exists });
  } catch (err) {
    res.status(500).json({ err: err.message });
  }
});

app.get('/exists-callback', (req, res) => {
  collection1.exists('get-key-2', (err, result) => {
    if (err) return res.status(500).send({ err: err.message });
    res.json({ result: result.exists });
  });
});

app.post('/getAndTouch-promise', async (req, res) => {
  try {
    await collection1.getAndTouch('getandtouch-key-1', 5);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ err: err.message });
  }
});

app.post('/getAndTouch-callback', (req, res) => {
  collection1.getAndTouch('getandtouch-key-2', 5, err => {
    if (err) return res.status(500).send({ err: err.message });
    res.json({ success: true });
  });
});

app.post('/replace-promise', async (req, res) => {
  try {
    await collection1.replace('replace-key-1', 'replacedvalue');
    const result = await collection1.get('replace-key-1');
    res.json({ result: result.value });
  } catch (err) {
    res.status(500).json({ err: err.message });
  }
});

app.post('/replace-callback', (req, res) => {
  collection1.replace('replace-key-1', 'replacedvalue', err => {
    if (err) return res.status(500);

    collection1.get('replace-key-1', (err2, result) => {
      if (err2) return res.status(500).send({ err: err.message });
      res.json({ result: result.value });
    });
  });
});

app.get('/lookupIn-promise', async (req, res) => {
  try {
    const result = await collection1.lookupIn('lookup-key-1', [couchbase.LookupInSpec.get('bar')]);
    res.json({ result: result.content[0].value });
  } catch (err) {
    res.status(500).json({ err: err.message });
  }
});

app.get('/lookupIn-callback', (req, res) => {
  collection1.lookupIn('lookup-key-1', [couchbase.LookupInSpec.get('bar')], (err, result) => {
    if (err) return res.status(500).send({ err: err.message });
    res.json({ result: result.content[0].value });
  });
});

app.post('/mutateIn-promise', async (req, res) => {
  try {
    await collection1.mutateIn('mutate-key-1', [couchbase.MutateInSpec.increment('foo', 3)]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ err: err.message });
  }
});

app.post('/mutateIn-callback', (req, res) => {
  collection1.mutateIn('mutate-key-1', [couchbase.MutateInSpec.increment('foo', 3)], err => {
    if (err) return res.status(500).send({ err: err.message });

    res.json({ success: true });
  });
});

app.post('/insert-promise', async (req, res) => {
  try {
    await collection1.insert('insert-key-5', { name: 'insertvalue' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ err: err.message });
  }
});

app.post('/insert-callback', (req, res) => {
  collection1.insert('insert-key-6', { name: 'insertvalue' }, err => {
    if (err) return res.status(500).send({ err: err.message });

    res.json({ success: true });
  });
});

app.post('/upsert-promise', async (req, res) => {
  try {
    await collection1.upsert('upsert-key-1', { name: 'upsertvalue' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ err: err.message });
  }
});

app.post('/upsert-callback', (req, res) => {
  collection1.upsert('upsert-key-1', { name: 'upsertvalue' }, err => {
    if (err) return res.status(500).send({ err: err.message });

    res.json({ success: true });
  });
});

app.post('/remove-promise', async (req, res) => {
  const err = req.query.error;

  if (err) {
    try {
      await collection1.remove();
      res.status(500);
    } catch (removeErr) {
      res.json({ errMsg: removeErr.message });
    }
  } else {
    try {
      await collection1.remove('remove-key-1');
      res.json({ success: true });
    } catch (err1) {
      res.status(500).json({ err: err1.message });
    }
  }
});
app.post('/remove-callback', (req, res) => {
  const err = req.query.error;

  if (err) {
    collection1.remove('doesnotexist', err1 => {
      if (err1) return res.json({ errMsg: err1.message });
      res.status(500).send({ err: err1.message });
    });
  } else {
    collection1.remove('remove-key-2', err2 => {
      if (err2) return res.status(500).send({ err: err2.message });
      res.json({ success: true });
    });
  }
});

app.post('/searchindexes-promise', async (req, res) => {
  try {
    const idx1 = `s_${uuid.v1()}`;

    await upsertIndex(idx1);

    await cluster.searchIndexes().getIndex(idx1);
    await cluster.searchIndexes().getAllIndexes();
    await cluster.searchIndexes().dropIndex(idx1);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ err: err.message });
  }
});

app.post('/searchindexes-callback', (req, res) => {
  const idx1 = `s_${uuid.v1()}`;

  upsertIndex(idx1, err => {
    if (err) return res.status(500).json({ err: err.message });

    cluster.searchIndexes().getIndex(idx1, err1 => {
      if (err1) return res.status(500).json({ err: err1.message });

      cluster.searchIndexes().getAllIndexes(err2 => {
        if (err2) return res.status(500).json({ err: err2.message });

        cluster.searchIndexes().dropIndex(idx1, err3 => {
          if (err3) return res.status(500).json({ err: err3.message });

          res.json({ success: true });
        });
      });
    });
  });
});

app.post('/analyticsindexes-promise', async (req, res) => {
  const dvName = `d_${uuid.v1()}`;
  const dsName = `d_${uuid.v1()}`;
  const idxName = `i_${uuid.v1()}`;

  try {
    await cluster.analyticsIndexes().createDataverse(dvName, {
      ignoreIfExists: true
    });
  } catch (err) {
    return res.status(500).json({ err: `${err.message} cluster.analyticsIndexes().createDataverse` });
  }

  try {
    await cluster.analyticsIndexes().createDataset(bucket1.name, dsName, {
      dataverseName: dvName
    });
  } catch (err) {
    return res.status(500).json({ err: `${err.message} cluster.analyticsIndexes().createDataset` });
  }

  try {
    await cluster.analyticsIndexes().createIndex(
      dsName,
      idxName,
      { name: 'string' },
      {
        dataverseName: dvName
      }
    );
  } catch (err) {
    return res.status(500).json({ err: `${err.message} cluster.analyticsIndexes().createIndex` });
  }

  try {
    await cluster.analyticsIndexes().getAllDatasets();
  } catch (err) {
    return res.status(500).json({ err: `${err.message} cluster.analyticsIndexes().getAllDatasets` });
  }

  try {
    await cluster.analyticsIndexes().getAllIndexes();
  } catch (err) {
    return res.status(500).json({ err: `${err.message} cluster.analyticsIndexes().getAllIndexes` });
  }

  try {
    await cluster.analyticsIndexes().dropIndex(dsName, idxName, {
      dataverseName: dvName
    });
  } catch (err) {
    return res.status(500).json({ err: `${err.message} cluster.analyticsIndexes().dropIndex` });
  }

  try {
    await cluster.analyticsIndexes().dropDataset(dsName, {
      dataverseName: dvName
    });
  } catch (err) {
    return res.status(500).json({ err: `${err.message} cluster.analyticsIndexes().dropDataset` });
  }

  try {
    await cluster.analyticsIndexes().dropDataverse(dvName);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ err: `${err.message} cluster.analyticsIndexes().dropDataverse` });
  }
});

app.post('/analyticsindexes-callback', (req, res) => {
  const dvName = `d_${uuid.v1()}`;
  const dsName = `d_${uuid.v1()}`;
  const idxName = `i_${uuid.v1()}`;

  cluster.analyticsIndexes().createDataverse(
    dvName,
    {
      ignoreIfExists: true
    },
    err => {
      if (err) return res.status(500).json({ err: err.message });

      cluster.analyticsIndexes().createDataset(
        bucket1.name,
        dsName,
        {
          dataverseName: dvName
        },
        err2 => {
          if (err2) return res.status(500).json({ err: err2.message });

          cluster.analyticsIndexes().createIndex(
            dsName,
            idxName,
            { name: 'string' },
            {
              dataverseName: dvName
            },
            err3 => {
              if (err3) return res.status(500).json({ err: err3.message });

              cluster.analyticsIndexes().getAllDatasets(err4 => {
                if (err4) return res.status(500).json({ err: err4.message });

                cluster.analyticsIndexes().getAllIndexes(err5 => {
                  if (err5) return res.status(500).json({ err: err5.message });

                  cluster.analyticsIndexes().dropIndex(
                    dsName,
                    idxName,
                    {
                      dataverseName: dvName
                    },
                    err6 => {
                      if (err6) return res.status(500).json({ err: err6.message });

                      cluster.analyticsIndexes().dropDataset(
                        dsName,
                        {
                          dataverseName: dvName
                        },
                        err7 => {
                          if (err7) return res.status(500).json({ err: err7.message });

                          cluster.analyticsIndexes().dropDataverse(dvName, () => {
                            res.json({ success: true });
                          });
                        }
                      );
                    }
                  );
                });
              });
            }
          );
        }
      );
    }
  );
});

app.get('/searchquery-promise', async (req, res) => {
  const idx1 = `s_${uuid.v1()}`;

  try {
    await upsertIndex(idx1);

    // returns zero rows, we do not care
    await cluster.searchQuery(idx1, couchbase.SearchQuery.term('something').field('something'), {
      explain: true,
      fields: ['name']
    });

    await cluster.searchIndexes().dropIndex(idx1);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ err: err.message });
  }
});

app.get('/searchquery-callback', async (req, res) => {
  const idx1 = `s_${uuid.v1()}`;

  try {
    await upsertIndex(idx1);
  } catch (err1) {
    return res.status(500).json({ err: err1.message });
  }

  // returns zero rows, we do not care
  cluster.searchQuery(
    idx1,
    couchbase.SearchQuery.term('something').field('something'),
    {
      explain: true,
      fields: ['name']
    },
    async err => {
      if (err) return res.status(500).send({ err: err.message });

      try {
        await cluster.searchIndexes().dropIndex(idx1);
      } catch (err2) {
        return res.status(500).json({ err: err2.message });
      }

      res.json({ success: true });
    }
  );
});

app.get('/transactions-promise', async (req, res) => {
  const rollback = req.query.rollback || false;

  try {
    await cluster.transactions().run(async attempt => {
      const testDocIns = `s_${uuid.v1()}`;
      await attempt.insert(collection1, testDocIns, { foo: 'baz' });
      const doc = await attempt.get(collection1, testDocIns);

      if (rollback) {
        throw new Error('rollback');
      } else {
        await attempt.remove(doc);
        res.json({ success: true });
      }
    });
  } catch (err) {
    res.json({ success: true });
  }
});

// https://issues.couchbase.com/browse/MB-46643
app.post('/queryindexes-promise', async (req, res) => {
  const idx1 = `s_${uuid.v1()}`;
  const idx2 = `s_${uuid.v1()}`;

  try {
    // createPrimaryIndex uses a different notation
    // eslint-disable-next-line max-len
    // https://github.com/couchbase/couchnode/blob/e855b094cd1b0140ffefc40f32a828b9134d181c/lib/queryindexmanager.ts#L896
    await cluster.queryIndexes().createPrimaryIndex(bucket1.name, { name: idx1 });
    await cluster.queryIndexes().createIndex(bucket2.name, idx2, ['name']);

    const qs = `SELECT * FROM ${bucket1.name} WHERE name='${idx1}'`;
    await cluster.query(qs);

    const qs1 = `SELECT * FROM ${collection2.name} WHERE name='${idx2}'`;
    await scope2.query(qs1);

    try {
      const qs2 = `SELECT * FROM TABLE_DOES_NOT_EXIST WHERE name='${idx2}'`;
      await scope2.query(qs2);
    } catch (err) {
      // ignore
    }

    await cluster.queryIndexes().dropIndex(bucket1.name, idx1);
    await cluster.queryIndexes().dropPrimaryIndex(bucket2.name, { name: idx2 });

    await cluster.queryIndexes().getAllIndexes(bucket2.name);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ err: err.message });
  }
});

app.post('/queryindexes-callback', (req, res) => {
  const idx1 = `s_${uuid.v1()}`;
  const idx2 = `s_${uuid.v1()}`;

  const qs = `SELECT * FROM ${bucket1.name} WHERE name='${idx1}'`;
  const qs1 = `SELECT * FROM ${collection2.name} WHERE name='${idx2}'`;
  const qs2 = `SELECT * FROM TABLE_DOES_NOT_EXIST WHERE name='${idx2}'`;

  cluster.queryIndexes().createPrimaryIndex(bucket1.name, { name: idx1 }, err => {
    if (err) return res.status(500).json({ err: err.message });

    cluster.queryIndexes().createIndex(bucket2.name, idx2, ['name'], err1 => {
      if (err1) return res.status(500).json({ err: err1.message });

      cluster.query(qs, err2 => {
        if (err2) return res.status(500).json({ err: err2.message });

        scope2.query(qs1, err3 => {
          if (err3) return res.status(500).json({ err: err3.message });

          scope2.query(qs2, () => {
            cluster.queryIndexes().dropIndex(bucket2.name, idx2, err5 => {
              if (err5) return res.status(500).json({ err: err5.message });

              cluster.queryIndexes().dropPrimaryIndex(bucket1.name, { name: idx1 }, err6 => {
                if (err6) return res.status(500).json({ err: err6.message });

                cluster.queryIndexes().getAllIndexes(bucket2.name, err7 => {
                  if (err7) return res.status(500).json({ err: err7.message });

                  res.json({ success: true });
                });
              });
            });
          });
        });
      });
    });
  });
});

app.get('/multiple-connections-promise', async (req, res) => {
  const idx1 = `s_${uuid.v1()}`;

  try {
    await cluster.queryIndexes().createPrimaryIndex(bucket1.name, { name: idx1 });

    const qs = `SELECT * FROM ${bucket1.name} WHERE name='${idx1}'`;
    await cluster.query(qs);
    await cluster2.query(qs);

    await cluster.queryIndexes().dropIndex(bucket1.name, idx1);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ err: err.message });
  }
});

app.get('/datastructures-list-promise', async (req, res) => {
  const key = `s_${uuid.v1()}`;
  const listObj = collection1.list(key);

  try {
    //  mutateIn
    await listObj.push('test2');
    await listObj.unshift('test1');

    // get
    await listObj.getAll();

    // lookupIn
    await listObj.getAt(1);

    const iteratedItems = [];

    // get
    await listObj.forEach(item => {
      iteratedItems.push(item);
    });

    // get
    await listObj.indexOf('test2');

    // lookupin
    await listObj.size();

    // mutateIn
    await listObj.removeAt(1);

    res.json({ iteratedItems });
  } catch (err) {
    res.status(500).json({ err: err.message });
  }
});

app.get('/datastructures-map-promise', async (req, res) => {
  const key = `s_${uuid.v1()}`;
  const mapObj = collection1.map(key);

  try {
    //  mutateIn
    await mapObj.set('foo', 'test1');
    await mapObj.set('bar', 'test2');

    // get
    await mapObj.getAll();

    // get
    await mapObj.get('foo');

    // get
    const iteratedItems = [];
    await mapObj.forEach(item => {
      iteratedItems.push(item);
    });

    // lookupin
    await mapObj.exists('foo');

    // lookupin
    await mapObj.size();

    // mutateIn
    await mapObj.remove('bar');

    res.json({ iteratedItems });
  } catch (err) {
    res.status(500).json({ err: err.message });
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
