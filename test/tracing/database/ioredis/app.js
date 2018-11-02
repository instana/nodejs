/* eslint-disable no-console */
/* global Promise */

'use strict';

var agentPort = process.env.AGENT_PORT;

require('../../../../')({
  agentPort: agentPort,
  level: 'info',
  tracing: {
    forceTransmissionStartingAt: 1
  }
});

var bodyParser = require('body-parser');
var express = require('express');
var morgan = require('morgan');
var redis = require('ioredis');
var request = require('request-promise');

var app = express();
var logPrefix = 'Express / Redis App (' + process.pid + '):\t';
var connectedToRedis = true;

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
  client.get(key).then(
    function(redisRes) {
      res.send(redisRes);
    },
    function(err) {
      log('Get with key %s failed', key, err);
      res.sendStatus(500);
    }
  );
});

app.get('/keepTracing', function(req, res) {
  var key = req.query.key;
  var redisResponse = null;
  client
    .get(key)
    .then(function(redisRes) {
      redisResponse = redisRes;
      // Execute another traced call to verify that we keep the tracing context.
      return request('http://127.0.0.1:' + agentPort);
    })
    .then(function(httpRes) {
      res.send(httpRes + ';' + redisResponse);
    })
    .catch(function(err) {
      log('Unexpected error for key %s', key, err);
      res.sendStatus(500);
    });
});

app.get('/keepTracingCallback', function(req, res) {
  // this uses a self created promise and a mix promise and callback styles,
  // in particular, it uses the ioredis optional callback argument.
  var key = req.query.key;
  return new Promise(function(resolve, reject) {
    // using ioredis client with callback instead of a promise here
    client.get(key, function(err, redisRes) {
      if (err) {
        log('Get with key %s failed', key, err);
        reject(err);
        return;
      }
      // Execute another traced call to verify that we keep the tracing context.
      request('http://127.0.0.1:' + agentPort, function(httpErr, httpRes) {
        if (httpErr) {
          log('HTTP call failed', httpErr);
          return reject(httpErr);
        }
        return resolve(httpRes.body + ';' + redisRes);
      });
    });
  })
    .then(function(result) {
      res.send(result);
    })
    .catch(function(err) {
      log('Unexpected error for key %s', key, err);
      res.sendStatus(500);
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
  // simulating wrong get usage
  client
    .multi()
    .hset('someCollection', 'key', 'value')
    .hget('someCollection', 'key')
    .exec(function(err) {
      if (err) {
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
        res.sendStatus(500);
      } else {
        res.sendStatus(200);
      }
    });
});

app.post('/multiKeepTracing', function(req, res) {
  var redisResponse = null;
  client
    .multi()
    .hset('someCollection', 'key', 'value')
    .hget('someCollection', 'key')
    .exec()
    .then(function(redisRes) {
      redisResponse = redisRes;
      // Execute another traced call to verify that we keep the tracing context.
      return request('http://127.0.0.1:' + agentPort);
    })
    .then(function(httpRes) {
      res.send(httpRes + ';' + redisResponse);
    })
    .catch(function(err) {
      log('Unexpected error', err);
      res.sendStatus(500);
    });
});

app.get('/pipeline', function(req, res) {
  client
    .pipeline()
    .hset('someCollection', 'key', 'value')
    .hset('someCollection', 'key2', 'value')
    .hget('someCollection', 'key')
    .exec(function(err) {
      if (err) {
        res.sendStatus(500);
      } else {
        res.sendStatus(200);
      }
    });
});

app.get('/pipelineFailure', function(req, res) {
  client
    .pipeline()
    .hset('someCollection', 'key', 'value')
    .hset('someCollection', 'key2', 'value', 'tooManyArgs')
    .hget('someCollection', 'key')
    .exec(function(err) {
      if (err) {
        res.sendStatus(500);
      } else {
        res.sendStatus(200);
      }
    });
});

app.post('/pipelineKeepTracing', function(req, res) {
  var redisResponse = null;
  client
    .pipeline()
    .hset('someCollection', 'key', 'value')
    .hget('someCollection', 'key')
    .exec()
    .then(function(redisRes) {
      redisResponse = redisRes;
      // Execute another traced call to verify that we keep the tracing context.
      return request('http://127.0.0.1:' + agentPort);
    })
    .then(function(httpRes) {
      res.send(httpRes + ';' + redisResponse);
    })
    .catch(function(err) {
      log('Unexpected error', err);
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
