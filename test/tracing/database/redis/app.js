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
var express = require('express');
var morgan = require('morgan');
var redis = require('redis');

var app = express();
var logPrefix = 'Express / Redis App (' + process.pid + '):\t';
var connectedToRedis = false;

var client = redis.createClient('//' + process.env.REDIS);
client.on('ready', function() {
  connectedToRedis = true;
});

if (process.env.WITH_STDOUT) {
  app.use(morgan(logPrefix + ':method :url :status'));
}

app.use(bodyParser.json());

app.get('/', function(req, res) {
  if (!connectedToRedis) {
    res.sendStatus(500);
  } else {
    res.sendStatus(200);
  }
});

app.post('/values', function(req, res) {
  var key = req.query.key;
  var value = req.query.value;
  client.set(key, value, function(err) {
    if (err) {
      log('Set with key %s, value %s failed', key, value, err);
      res.sendStatus(500);
    } else {
      res.sendStatus(200);
    }
  });
});

app.get('/values', function(req, res) {
  var key = req.query.key;
  client.get(key, function(err, redisRes) {
    if (err) {
      log('Get with key %s failed', key, err);
      res.sendStatus(500);
    } else {
      res.send(redisRes);
    }
  });
});

app.get('/failure', function(req, res) {
  // simulating wrong get usage
  client.get('someCollection', 'someKey', 'someValue', function(err, redisRes) {
    if (err) {
      res.sendStatus(500);
    } else {
      res.send(redisRes);
    }
  });
});

app.get('/multi', function(req, res) {
  client
    .multi()
    .hset('someCollection', 'key', 'value')
    .hget('someCollection', 'key')
    .exec(function(err) {
      if (err) {
        log('Multi failed', err);
        res.sendStatus(500);
      } else {
        res.sendStatus(200);
      }
    });
});

app.get('/multiFailure', function(req, res) {
  // simulating wrong get usage
  client
    .multi()
    .hset('someCollection', 'key', 'value')
    .hget('someCollection', 'key', 'too', 'many', 'args')
    .exec(function(err) {
      if (err) {
        log('Multi failed', err);
        res.sendStatus(500);
      } else {
        res.sendStatus(200);
      }
    });
});

app.get('/batchFailure', function(req, res) {
  // simulating wrong get usage
  client
    .batch()
    .hset('someCollection', 'key', 'value')
    .hget('someCollection', 'key', 'too', 'many', 'args')
    .exec(function(err) {
      if (err) {
        log('batch failed', err);
        res.sendStatus(500);
      } else {
        res.sendStatus(200);
      }
    });
});

app.get('/callSequence', function(req, res) {
  var key = 'foo';
  var value = 'bar';
  client.set(key, value, function(err) {
    if (err) {
      log('Set with key %s, value %s failed', key, value, err);
      res.sendStatus(500);
      return;
    }

    client.get(key, function(err2, result) {
      if (err2) {
        log('get with key %s failed', key, err2);
        res.sendStatus(500);
        return;
      }

      res.send(result);
    });
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
