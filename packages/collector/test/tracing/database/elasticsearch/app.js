/* eslint-disable no-console */

'use strict';

require('../../../../')({
  agentPort: process.env.AGENT_PORT,
  level: 'warn',
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

app.get('/mget1', function(req, res) {
  var ids = req.query.id;
  if (!Array.isArray(ids) || ids.length < 2) {
    return res.status(400).json({ error: 'You need to provide an array of at least two document IDs.' });
  }
  client.mget(
    {
      body: {
        docs: [
          { _index: req.query.index || 'myindex', _type: 'mytype', _id: ids[0] },
          { _index: req.query.index || 'myindex', _type: 'mytype', _id: ids[1] }
        ]
      }
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

app.get('/mget2', function(req, res) {
  var ids = req.query.id;
  if (!Array.isArray(ids) || ids.length < 2) {
    return res.status(400).json({ error: 'You need to provide an array of at least two document IDs.' });
  }
  client.mget(
    {
      index: req.query.index || 'myindex',
      type: 'mytype',
      body: {
        ids: ids
      }
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

app.get('/msearch', function(req, res) {
  var queryStrings = req.query.q;
  if (!Array.isArray(queryStrings) || queryStrings.length < 2) {
    return res.status(400).json({ error: 'You need to provide an array of at least two query params' });
  }
  var query = {
    body: [
      { index: req.query.index || 'myindex', type: 'mytype' },
      { query: { query_string: { query: req.query.q[0] } } },
      { index: req.query.index || 'myindex', type: 'mytype' },
      { query: { query_string: { query: req.query.q[1] } } }
    ]
  };
  client.msearch(query).then(
    function(response) {
      res.json(response);
    },
    function(error) {
      res.status(500).json(error);
    }
  );
});

app.post('/index', function(req, res) {
  client
    .index({
      index: req.query.index || 'myindex',
      type: 'mytype',
      body: req.body
    })
    .then(function(response) {
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
            log('Index refresh failed.', error);
            throw error;
          }
        );
    })
    .then(
      function(response) {
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
