/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

/* eslint-disable no-console */

'use strict';

require('./mockVersion');
const agentPort = process.env.INSTANA_AGENT_PORT;

require('../../../..')();

const bodyParser = require('body-parser');
const express = require('express');
const morgan = require('morgan');
const request = require('request-promise-native');
const { Client } = require('@elastic/elasticsearch');
const app = express();
const logPrefix = `Elasticsearch ${process.env.ELASTIC_VERSION} (Modern Client) (${process.pid}):\t`;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

const client = new Client({
  node: `http://${process.env.ELASTICSEARCH}`
});

app.get('/', (req, res) => {
  res.sendStatus(200);
});

app.get('/get', (req, res) => {
  client.get(
    {
      index: req.query.index || 'modern_index',
      id: req.query.id
    },
    {},
    (error, response) => {
      // Execute another traced call to verify that we keep the tracing context.
      request(`http://127.0.0.1:${agentPort}`).then(() => {
        res.json({ error, response });
      });
    }
  );
});

app.get('/search', (req, res) => {
  let searchResponse;
  client
    .search({
      index: req.query.index || 'modern_index',
      q: req.query.q
    })
    .then(response => {
      searchResponse = response;
      // Execute another traced call to verify that we keep the tracing context.
      return request(`http://127.0.0.1:${agentPort}`);
    })
    .then(() => {
      res.json({ response: searchResponse });
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
  client.mget(
    {
      body: {
        docs: [
          { _index: req.query.index || 'modern_index', _id: ids[0] },
          { _index: req.query.index || 'modern_index', _id: ids[1] }
        ]
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
});

app.get('/mget2', (req, res) => {
  const ids = req.query.id;
  if (!Array.isArray(ids) || ids.length < 2) {
    return res.status(400).json({ error: 'You need to provide an array of at least two document IDs.' });
  }
  client.mget(
    {
      index: req.query.index || 'modern_index',
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
});

app.get('/msearch', (req, res) => {
  const queryStrings = req.query.q;
  if (!Array.isArray(queryStrings) || queryStrings.length < 2) {
    return res.status(400).json({ error: 'You need to provide an array of at least two query params' });
  }
  const query = {
    body: [
      { index: req.query.index || 'modern_index' },
      { query: { query_string: { query: req.query.q[0] } } },
      { index: req.query.index || 'modern_index' },
      { query: { query_string: { query: req.query.q[1] } } }
    ]
  };
  client.msearch(query).then(
    response => {
      res.json({ response });
    },
    error => {
      res.json({ error });
    }
  );
});

app.post('/index', (req, res) => {
  client
    .index({
      index: req.query.index || 'modern_index',
      body: req.body
    })
    .then(response =>
      client.indices
        .refresh({
          index: '_all',
          ignoreUnavailable: true
        })
        .then(
          () => response,
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

app.listen(process.env.APP_PORT, () => {
  log(`Listening on port: ${process.env.APP_PORT}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
