/* eslint-disable */

var express = require('express');
var bodyParser = require('body-parser');
var app = express();

var discoveries = {};
var retrievedData = {
  runtime: [],
  traces: []
};

app.use(bodyParser.json());


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
    pid: pid
  });
});


app.head('/com.instana.plugin.nodejs.:pid', checkExistenceOfKnownPid(function handleAnnounceCheck(req, res) {
  log('Got announce check for pid: ', req.params.pid);
  res.send('OK');
}));


app.post('/com.instana.plugin.nodejs.:pid', checkExistenceOfKnownPid(function handleDataRetrieval(req, res) {
  retrievedData.runtime.push({
    pid: parseInt(req.params.pid, 10),
    time: Date.now(),
    data: req.body
  });
  log('Got new data for PID ' + req.params.pid);
  res.send('OK');
}));


app.post('/com.instana.plugin.nodejs/traces.:pid', checkExistenceOfKnownPid(function handleDataRetrieval(req, res) {
  retrievedData.traces.push({
    pid: parseInt(req.params.pid, 10),
    time: Date.now(),
    data: req.body
  });
  log('Got new spans for PID ' + req.params.pid);
  res.send('OK');
}));


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


app.get('/retrievedData', function(req, res) {
  log('Sending retrieved data');
  res.json(retrievedData);
});


app.delete('/retrievedData', function(req, res) {
  log('Clearing retrieved data');
  retrievedData = {
    runtime: [],
    traces: []
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


app.listen(process.env.AGENT_PORT, function() {
  log('Listening on port: ' + process.env.AGENT_PORT);
});

function log() {
  var args = Array.prototype.slice.call(arguments);
  args[0] = 'Agent Stub (' + process.pid + '):\t' + args[0];
  console.log.apply(console, args);
}
