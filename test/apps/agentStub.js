/* eslint-disable */

var bodyParser = require('body-parser');
var express = require('express');
var morgan = require('morgan');
var app = express();

var logPrefix = 'Agent Stub (' + process.pid + '):\t';
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
  app.use(morgan(logPrefix + ':method :url :status'));
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

  log('New discovery %s with params', pid, req.body);

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
    log('Got announce check for pid: ', req.params.pid);
    res.send('OK');
  })
);

app.post(
  '/com.instana.plugin.nodejs.:pid',
  checkExistenceOfKnownPid(function handleDataRetrieval(req, res) {
    if (!dropAllData) {
      retrievedData.runtime.push({
        pid: parseInt(req.params.pid, 10),
        time: Date.now(),
        data: req.body
      });
    }

    var requestsForPid = requests[req.params.pid] || [];
    log('Got new data for PID ' + req.params.pid + '. Responding with ' + requestsForPid.length + ' requests.');
    res.json(requestsForPid);
    delete requests[req.params.pid];
  })
);

app.post(
  '/com.instana.plugin.nodejs/traces.:pid',
  checkExistenceOfKnownPid(function handleDataRetrieval(req, res) {
    if (!dropAllData) {
      retrievedData.traces.push({
        pid: parseInt(req.params.pid, 10),
        time: Date.now(),
        data: req.body
      });
    }
    log('Got new spans for PID ' + req.params.pid);
    res.send('OK');
  })
);

app.post(
  '/com.instana.plugin.nodejs/response.:pid',
  checkExistenceOfKnownPid(function handleDataRetrieval(req, res) {
    if (!dropAllData) {
      retrievedData.responses.push({
        pid: parseInt(req.params.pid, 10),
        time: Date.now(),
        messageId: req.query.messageId,
        data: req.body
      });
    }
    log('Got new responses for PID ' + req.params.pid);
    res.send('OK');
  })
);

function checkExistenceOfKnownPid(fn) {
  return function(req, res) {
    var pid = req.params.pid;
    if (!discoveries[pid]) {
      log('Rejecting access for pid ' + pid + ' as PID is not a known discovery');
      return res.status(400).send('Unknown discovery with pid: ' + pid);
    }
    fn(req, res);
  };
}

app.post('/com.instana.plugin.generic.event', function postEvent(req, res) {
  if (!dropAllData) {
    retrievedData.events.push(req.body);
  }
  log('Got new events', req.body);
  res.send('OK');
});

app.get('/retrievedData', function(req, res) {
  log('Sending retrieved data');
  res.json(retrievedData);
});

app.get('/retrievedTraces', function(req, res) {
  log('Sending retrieved data');
  res.json(retrievedData.traces);
});

app.get('/retrievedEvents', function(req, res) {
  log('Sending retrieved events');
  res.json(retrievedData.events);
});

app.delete('/retrievedData', function(req, res) {
  log('Clearing retrieved data');
  retrievedData = {
    runtime: [],
    traces: [],
    responses: [],
    events: []
  };
  res.sendStatus(200);
});

app.get('/discoveries', function(req, res) {
  log('Sending discoveries');
  res.json(discoveries);
});

app.delete('/discoveries', function(req, res) {
  log('Clearing discoveries');
  discoveries = {};
  res.send('OK');
});

app.post('/request/:pid', function(req, res) {
  requests[req.params.pid] = requests[req.params.pid] || [];
  requests[req.params.pid].push(req.body);
  res.send('OK');
});

app.listen(process.env.AGENT_PORT, function() {
  log('Listening on port: ' + process.env.AGENT_PORT);
});

function log() {
  var args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
