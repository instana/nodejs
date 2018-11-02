/* eslint-disable no-console */

'use strict';

require('../../../../')({
  agentPort: process.env.AGENT_PORT,
  level: 'info',
  tracing: {
    forceTransmissionStartingAt: 1
  }
});

var bodyParser = require('body-parser');
var mongoose = require('mongoose');
var express = require('express');
var morgan = require('morgan');

var app = express();
var logPrefix = 'Express / Mongoose App (' + process.pid + '):\t';
var connectedToMongo = false;

mongoose.Promise = global.Promise;

mongoose.model(
  'Person',
  new mongoose.Schema({
    name: String,
    age: Number
  })
);
var Person = mongoose.model('Person');

mongoose.connect(
  'mongodb://' + process.env.MONGODB + '/mongoose',
  function(err) {
    if (err) {
      log('Failed to connect to Mongodb', err);
      process.exit(1);
    }
    connectedToMongo = true;
  }
);

if (process.env.WITH_STDOUT) {
  app.use(morgan(logPrefix + ':method :url :status'));
}

app.use(bodyParser.json());

app.get('/', function(req, res) {
  if (!connectedToMongo) {
    res.sendStatus(500);
  } else {
    res.sendStatus(200);
  }
});

app.post('/insert', function(req, res) {
  Person.create(req.body)
    .then(function(r) {
      res.json(r);
    })
    .catch(function(e) {
      log('Failed to write document', e);
      res.sendStatus(500);
    });
});

app.post('/find', function(req, res) {
  Person.findOne(req.body)
    .exec()
    .then(function(r) {
      res.json(r);
    })
    .catch(function(e) {
      log('Failed to find document', e);
      res.sendStatus(500);
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
