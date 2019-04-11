/* eslint-disable no-console */
/* global Promise */

'use strict';

var agentPort = process.env.AGENT_PORT;

require('../../../../')({
  agentPort: agentPort,
  level: 'warn',
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
var request = require('request-promise');

var app = express();
var db;
var collection;
var logPrefix = 'Express / MongoDB App (' + process.pid + '):\t';

if (process.env.WITH_STDOUT) {
  app.use(morgan(logPrefix + ':method :url :status'));
}

app.use(bodyParser.json());

MongoClient.connect('mongodb://' + process.env.MONGODB + '/myproject', function(err, client) {
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

app.get('/', function(req, res) {
  if (!db || !collection) {
    res.sendStatus(500);
  } else {
    res.sendStatus(200);
  }
});

app.post('/insert', function(req, res) {
  var mongoResponse = null;
  collection
    .insertOne(req.body)
    .then(function(r) {
      mongoResponse = r;
      // Execute another traced call to verify that we keep the tracing context.
      return request('http://127.0.0.1:' + agentPort);
    })
    .then(function() {
      res.json(mongoResponse);
    })
    .catch(function(e) {
      log('Failed to write document', e);
      res.sendStatus(500);
    });
});

app.post('/find', function(req, res) {
  var mongoResponse = null;
  collection
    .findOne(req.body)
    .then(function(r) {
      mongoResponse = r;
      // Execute another traced call to verify that we keep the tracing context.
      return request('http://127.0.0.1:' + agentPort);
    })
    .then(function() {
      res.json(mongoResponse);
    })
    .catch(function(e) {
      log('Failed to find document', e);
      res.sendStatus(500);
    });
});

// An operation with an artificial delay to check that we do not by mistake inject other incoming http entries into the
// current trace.
app.post('/long-find', function(req, res) {
  var mongoResponse = null;
  collection
    .findOne(req.body)
    .then(function(r) {
      mongoResponse = r;
      // add an artificial delay and let the test start another HTTP entry, then make sure it is not put into the
      // currently active trace.
      return new Promise(function(resolve) {
        setTimeout(resolve, 500);
      });
    })
    .then(function() {
      // Execute another traced call to verify that we keep the tracing context.
      return request('http://127.0.0.1:' + agentPort);
    })
    .then(function() {
      res.json(mongoResponse);
    })
    .catch(function(e) {
      log('Failed to find document', e);
      res.sendStatus(500);
    });
});

app.get('/ping', function(req, res) {
  res.sendStatus(200);
});

app.get('/findall', function(req, res) {
  collection
    .find({})
    .batchSize(2)
    .toArray(function(err, docs) {
      if (err) {
        res.status(500).json(err);
      } else {
        // Execute another traced call to verify that we keep the tracing context.
        return request('http://127.0.0.1:' + agentPort)
          .then(function() {
            res.json(docs);
          })
          .catch(function(err2) {
            res.status(500).json(err2);
          });
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
