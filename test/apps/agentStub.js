/* eslint-disable */

var express = require('express');
var bodyParser = require('body-parser');
var app = express();

var discoveries = {};
var retrievedData;
resetRetrievedData();

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

  console.log('Agent Stub: New discovery %s with params', pid, req.body);

  res.send({
    pid: pid
  });
});


app.head('/com.instana.plugin.nodejs.:pid', checkExistenceOfKnownPid(function handleAnnounceCheck(req, res) {
  console.log('Agent Stub: Got announce check for pid: ', req.params.pid);
  res.send('OK');
}));


app.post('/com.instana.plugin.nodejs.:pid', checkExistenceOfKnownPid(function handleDataRetrieval(req, res) {
  retrievedData.runtime.push({
    pid: parseInt(req.params.pid, 10),
    time: Date.now(),
    data: req.body
  });
  console.log('Agent Stub: Got new data for PID ' + req.params.pid);
  res.send('OK');
}));


function checkExistenceOfKnownPid(fn) {
  return function(req, res) {
    var pid = req.params.pid;
    if (!discoveries[pid]) {
      console.error('Agent Stub: Rejecting access for pid %s as PID is not a known discovery', pid);
      return res.status(400).send('Unknown discovery with pid: ' + pid);
    }
    fn(req, res);
  };
}


app.get('/retrievedData', function(req, res) {
  console.log('Agent Stub: Sending retrieved data');
  res.json(retrievedData);
  resetRetrievedData();
});


app.get('/discoveries', function(req, res) {
  console.log('Agent Stub: Sending discoveries');
  res.json(discoveries);
});


app.delete('/discoveries', function(req, res) {
  console.log('Agent Stub: Clearing discoveries');
  discoveries = {};
  res.send('OK');
});


function resetRetrievedData() {
  retrievedData = {
    runtime: [],
    traces: []
  };
}


app.listen(process.env.AGENT_PORT, function() {
  console.log('Agent stub listening on port: ' + process.env.AGENT_PORT);
});
