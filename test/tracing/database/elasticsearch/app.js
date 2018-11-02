/* eslint-disable no-console */

'use strict';

require('../../../../')({
  agentPort: process.env.AGENT_PORT,
  level: 'info',
  tracing: {
    enabled: process.env.TRACING_ENABLED === 'true',
    forceTransmissionStartingAt: 1
  }
});

var elasticsearch = require('elasticsearch');
var bodyParser = require('body-parser');
var request = require('request-promise-native');
var express = require('express');
var app = express();

app.use(bodyParser.json());

var client = new elasticsearch.Client({
  host: process.env.ELASTICSEARCH,
  log: 'info'
});

app.get('/', function(req, res) {
  res.sendStatus(200);
});

app.get('/get', function(req, res) {
  log('Getting document', req.query.id);
  client.get(
    {
      index: req.query.index || 'myindex',
      type: 'mytype',
      id: req.query.id
    },
    function(error, response) {
      if (error) {
        res.status(500).json(error);
      } else {
        res.json(response);
      }
    }
  );
});

app.get('/search', function(req, res) {
  log('Searching document', req.query.q);
  client
    .search({
      index: req.query.index || 'myindex',
      type: 'mytype',
      q: req.query.q
    })
    .then(
      function(response) {
        res.json(response);
      },
      function(error) {
        res.status(500).json(error);
      }
    );
});

app.post('/index', function(req, res) {
  log('Indexing document', req.body);
  client
    .index({
      index: req.query.index || 'myindex',
      type: 'mytype',
      body: req.body
    })
    .then(function(response) {
      log('Refreshing index');
      return client.indices
        .refresh({
          index: '_all',
          ignoreUnavailable: true,
          force: true
        })
        .then(
          function() {
            return response;
          },
          function(error) {
            log('Index refresh failed.');
            throw error;
          }
        );
    })
    .then(
      function(response) {
        log('Sending indexing response for document ' + response._id);
        res.json(response);
      },
      function(error) {
        log('Sending indexing error.', error);
        res.status(500).json(error);
      }
    );
});

app.get('/searchAndGet', function(req, res) {
  request({
    method: 'GET',
    url: 'http://google.com'
  })
    .then(function() {
      return client.search({
        index: req.query.index || 'myindex',
        type: 'mytype',
        q: req.query.q,
        ignoreUnavailable: true
      });
    })
    .then(function(response) {
      res.json(response);
    })
    .catch(function(error) {
      res.status(500).json(error);
    });
});

app.delete('/database', function(req, res) {
  client.indices
    .exists({
      index: req.query.index || 'myindex'
    })
    .then(function(response) {
      if (response === false) {
        return response;
      }

      return client.indices.delete({
        index: req.query.index || 'myindex'
      });
    })
    .then(function(response) {
      res.json(response);
    })
    .catch(function(error) {
      res.status(500).json(error);
    });
});

app.listen(process.env.APP_PORT, function() {
  log('Listening on port: ' + process.env.APP_PORT);
});

function log() {
  var args = Array.prototype.slice.call(arguments);
  args[0] = 'Express / Elasticsearch (' + process.pid + '):\t' + args[0];
  console.log.apply(console, args);
}
