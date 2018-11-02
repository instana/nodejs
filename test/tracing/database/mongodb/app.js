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

var MongoClient = require('mongodb').MongoClient;
var bodyParser = require('body-parser');
var express = require('express');
var morgan = require('morgan');
var assert = require('assert');

var app = express();
var db;
var collection;
var logPrefix = 'Express / MongoDB App (' + process.pid + '):\t';

if (process.env.WITH_STDOUT) {
  app.use(morgan(logPrefix + ':method :url :status'));
}

app.use(bodyParser.json());

MongoClient.connect(
  'mongodb://' + process.env.MONGODB + '/myproject',
  function(err, client) {
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
  }
);

app.get('/', function(req, res) {
  if (!db || !collection) {
    res.sendStatus(500);
  } else {
    res.sendStatus(200);
  }
});

app.post('/insert', function(req, res) {
  collection
    .insertOne(req.body)
    .then(function(r) {
      res.json(r);
    })
    .catch(function(e) {
      log('Failed to write document', e);
      res.sendStatus(500);
    });
});

app.post('/find', function(req, res) {
  collection
    .findOne(req.body)
    .then(function(r) {
      res.json(r);
    })
    .catch(function(e) {
      log('Failed to find document', e);
      res.sendStatus(500);
    });
});

app.get('/findall', function(req, res) {
  collection
    .find({})
    .batchSize(2)
    .toArray(function(err, docs) {
      if (err) {
        res.status(500).json(err);
      } else {
        res.json(docs);
      }
    });
});

app.listen(process.env.APP_PORT, function() {
  log('Listening on port: ' + process.env.APP_PORT);
});

function log() {
  var args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
