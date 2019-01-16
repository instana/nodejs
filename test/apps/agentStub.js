'use strict';

var bodyParser = require('body-parser');
var express = require('express');
var morgan = require('morgan');
var bunyan = require('bunyan');
var app = express();

var logger = bunyan.createLogger({ name: 'agent-stub', pid: process.pid });
// logger.level('debug');

var extraHeaders = process.env.EXTRA_HEADERS ? process.env.EXTRA_HEADERS.split(',') : [];
var secretsMatcher = process.env.SECRETS_MATCHER ? process.env.SECRETS_MATCHER : 'contains-ignore-case';
var secretsList = process.env.SECRETS_LIST ? process.env.SECRETS_LIST.split(',') : ['key', 'pass', 'secret'];
var dropAllData = process.env.DROP_DATA === 'true';
var discoveries = {};
var requests = {};
var retrievedData = {
  runtime: [],
  traces: [],
  responses: [],
  events: []
};

if (process.env.WITH_STDOUT) {
  app.use(morgan('Agent Stub (' + process.pid + '):\t:method :url :status'));
}

app.use(
  bodyParser.json({
    limit: '10mb'
  })
);

app.use(function(req, res, next) {
  res.set('server', 'Instana Agent');
  next();
});

app.get('/', function(req, res) {
  res.send('OK');
});

app.put('/com.instana.plugin.nodejs.discovery', function(req, res) {
  var pid = req.body.pid;
  discoveries[pid] = req.body;

  logger.debug('New discovery %s with params', pid, req.body);

  res.send({
    pid: pid,
    extraHeaders: extraHeaders,
    secrets: {
      matcher: secretsMatcher,
      list: secretsList
    }
  });
});

app.head(
  '/com.instana.plugin.nodejs.:pid',
  checkExistenceOfKnownPid(function handleAnnounceCheck(req, res) {
    logger.debug('Got announce check for PID %s', req.params.pid);
    res.send('OK');
  })
);

app.post(
  '/com.instana.plugin.nodejs.:pid',
  checkExistenceOfKnownPid(function handleEntityData(req, res) {
    if (!dropAllData) {
      retrievedData.runtime.push({
        pid: parseInt(req.params.pid, 10),
        time: Date.now(),
        data: req.body
      });
    }

    var requestsForPid = requests[req.params.pid] || [];
    res.json(requestsForPid);
    delete requests[req.params.pid];
  })
);

app.post(
  '/com.instana.plugin.nodejs/traces.:pid',
  checkExistenceOfKnownPid(function handleTraces(req, res) {
    if (!dropAllData) {
      retrievedData.traces.push({
        pid: parseInt(req.params.pid, 10),
        time: Date.now(),
        data: req.body
      });
    }
    res.send('OK');
  })
);

app.post(
  '/com.instana.plugin.nodejs/response.:pid',
  checkExistenceOfKnownPid(function handleResponse(req, res) {
    if (!dropAllData) {
      retrievedData.responses.push({
        pid: parseInt(req.params.pid, 10),
        time: Date.now(),
        messageId: req.query.messageId,
        data: req.body
      });
    }
    res.send('OK');
  })
);

function checkExistenceOfKnownPid(fn) {
  return function(req, res) {
    var pid = req.params.pid;
    if (!discoveries[pid]) {
      logger.debug('Rejecting access for PID %s, not a known discovery', pid);
      return res.status(400).send('Unknown discovery with pid: ' + pid);
    }
    fn(req, res);
  };
}

app.post('/com.instana.plugin.generic.event', function postEvent(req, res) {
  if (!dropAllData) {
    retrievedData.events.push(req.body);
  }
  res.send('OK');
});

app.get('/retrievedData', function(req, res) {
  res.json(retrievedData);
});

app.get('/retrievedTraces', function(req, res) {
  res.json(retrievedData.traces);
});

app.get('/retrievedEvents', function(req, res) {
  res.json(retrievedData.events);
});

app.delete('/retrievedData', function(req, res) {
  retrievedData = {
    runtime: [],
    traces: [],
    responses: [],
    events: []
  };
  res.sendStatus(200);
});

app.get('/discoveries', function(req, res) {
  res.json(discoveries);
});

app.delete('/discoveries', function(req, res) {
  discoveries = {};
  res.send('OK');
});

app.post('/request/:pid', function(req, res) {
  requests[req.params.pid] = requests[req.params.pid] || [];
  requests[req.params.pid].push(req.body);
  res.send('OK');
});

app.listen(process.env.AGENT_PORT, function() {
  logger.info('Listening on port: %s', process.env.AGENT_PORT);
});
