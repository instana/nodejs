/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

/* eslint-disable no-console */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

const agentPort = process.env.INSTANA_AGENT_PORT;

require('@instana/collector')();

const bodyParser = require('body-parser');
const express = require('express');
const morgan = require('morgan');

const { Client } = require('@elastic/elasticsearch');
const port = require('@_local/collector/test/test_util/app-port')();

const app = express();
const logPrefix = `Elasticsearch ${process.env.ELASTIC_VERSION} (${process.pid}):\t`;
const isLatest = process.env.ELASTIC_VERSION === 'latest';

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

const client = new Client({
  node: `http://${process.env.ELASTICSEARCH}`
});
const client2 = new Client({
  node: `http://${process.env.ELASTICSEARCH_ALTERNATIVE}`
});

// v7 & v8 have a different return value
const commonReturnValue = response => {
  if (response.body) return response;

  return {
    body: response
  };
};

app.get('/', (req, res) => {
  res.sendStatus(200);
});

app.get('/get', (req, res) => {
  // v8 dropped cb support
  if (isLatest) {
    client
      .get({
        index: req.query.index && req.query.index !== 'undefined' ? req.query.index : 'modern_index',
        id: req.query.id
      })
      .then(response => {
        fetch(`http://127.0.0.1:${agentPort}/ping`).then(() => {
          res.json({ response: commonReturnValue(response) });
        });
      })
      .catch(err => {
        fetch(`http://127.0.0.1:${agentPort}/ping`).then(() => {
          res.json({ error: err });
        });
      });
  } else {
    client.get(
      {
        index: req.query.index && req.query.index !== 'undefined' ? req.query.index : 'modern_index',
        id: req.query.id
      },
      {},
      (error, response) => {
        // Execute another traced call to verify that we keep the tracing context.
        fetch(`http://127.0.0.1:${agentPort}/ping`).then(() => {
          res.json({ error, response: commonReturnValue(response) });
        });
      }
    );
  }
});

app.get('/search', (req, res) => {
  let searchResponse;
  client
    .search({
      index: req.query.index && req.query.index !== 'undefined' ? req.query.index : 'modern_index',
      q: req.query.q
    })
    .then(response => {
      searchResponse = response;
      // Execute another traced call to verify that we keep the tracing context.
      return fetch(`http://127.0.0.1:${agentPort}/ping`);
    })
    .then(() => {
      res.json({ response: commonReturnValue(searchResponse) });
    })
    .catch(error => {
      res.json({ error });
    });
});

app.get('/mget1', (req, res) => {
  const ids = req.query.id;
  if (!Array.isArray(ids) || ids.length < 2) {
    return res.status(400).json({ error: 'You need to provide an array of at least two document IDs.' });
  }

  if (isLatest) {
    client
      .mget({
        body: {
          docs: [
            {
              _index: req.query.index && req.query.index !== 'undefined' ? req.query.index : 'modern_index',
              _id: ids[0]
            },
            {
              _index: req.query.index && req.query.index !== 'undefined' ? req.query.index : 'modern_index',
              _id: ids[1]
            }
          ]
        }
      })
      .then(response => {
        res.json({ response: commonReturnValue(response) });
      })
      .catch(err => {
        res.json({ error: err });
      });
  } else {
    client.mget(
      {
        body: {
          docs: [
            {
              _index: req.query.index && req.query.index !== 'undefined' ? req.query.index : 'modern_index',
              _id: ids[0]
            },
            {
              _index: req.query.index && req.query.index !== 'undefined' ? req.query.index : 'modern_index',
              _id: ids[1]
            }
          ]
        }
      },
      (error, response) => {
        if (error) {
          res.json({ error });
        } else {
          res.json({ response: commonReturnValue(response) });
        }
      }
    );
  }
});

app.get('/mget2', (req, res) => {
  const ids = req.query.id;
  if (!Array.isArray(ids) || ids.length < 2) {
    return res.status(400).json({ error: 'You need to provide an array of at least two document IDs.' });
  }

  if (isLatest) {
    client
      .mget({
        index: req.query.index && req.query.index !== 'undefined' ? req.query.index : 'modern_index',
        body: {
          ids
        }
      })
      .then(response => {
        res.json({ response: commonReturnValue(response) });
      })
      .catch(err => {
        res.json({ error: err });
      });
  } else {
    client.mget(
      {
        index: req.query.index && req.query.index !== 'undefined' ? req.query.index : 'modern_index',
        body: {
          ids
        }
      },
      (error, response) => {
        if (error) {
          res.json({ error });
        } else {
          res.json({ response });
        }
      }
    );
  }
});

app.get('/msearch', (req, res) => {
  const queryStrings = req.query.q;
  if (!Array.isArray(queryStrings) || queryStrings.length < 2) {
    return res.status(400).json({ error: 'You need to provide an array of at least two query params' });
  }

  const query = {
    body: [
      { index: req.query.index && req.query.index !== 'undefined' ? req.query.index : 'modern_index' },
      { query: { query_string: { query: req.query.q[0] } } },
      { index: req.query.index && req.query.index !== 'undefined' ? req.query.index : 'modern_index' },
      { query: { query_string: { query: req.query.q[1] } } }
    ]
  };

  client.msearch(query).then(
    response => {
      res.json({ response: commonReturnValue(response) });
    },
    error => {
      res.json({ error });
    }
  );
});

app.post('/index', (req, res) => {
  const ignoreKey = isLatest ? 'ignore_unavailable' : 'ignoreUnavailable';

  client
    .index({
      index: req.query.index && req.query.index !== 'undefined' ? req.query.index : 'modern_index',
      body: req.body
    })
    .then(response =>
      client.indices
        .refresh({
          index: '_all',
          [ignoreKey]: true
        })
        .then(
          () => commonReturnValue(response),
          error => {
            log('Index refresh failed.', error);
            throw error;
          }
        )
    )
    .then(
      response => {
        res.json({ response });
      },
      error => {
        res.json({ error });
      }
    );
});

app.post('/two-different-target-hosts', async (req, res) => {
  try {
    const response = {};
    const esResponse1 = await client.index({
      index: req.query.index || 'modern_index',
      body: req.body
    });
    response.response1 = esResponse1.result || esResponse1.statusCode;
    const esResponse2 = await client2.index({
      index: req.query.index || 'modern_index',
      body: req.body
    });
    response.response2 = esResponse2.result || esResponse2.statusCode;
    res.json(response);
  } catch (e) {
    log('Elasticsearch index operation failed.', e);
    return res.sendStatus(500);
  }
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
