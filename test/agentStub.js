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

  console.log('Discovery: New discovery %s with params', pid, req.body);

  res.send({
    pid: pid
  });
});


app.head('/com.instana.plugin.nodejs.:pid', checkExistenceOfKnownPid(function handleAnnounceCheck(req, res) {
  console.log('Announce Check: Got announce check for pid: ', req.params.pid);
  res.send('OK');
}));


app.post('/com.instana.plugin.nodejs.:pid', checkExistenceOfKnownPid(function handleDataRetrieval(req, res) {
  retrievedData.runtime.push({
    pid: req.params.pid,
    time: Date.now(),
    data: req.body
  });
  console.log('Retrieval: Got new data for PID ' + req.params.pid);
  res.send('OK');
}));


function checkExistenceOfKnownPid(fn) {
  return function(req, res) {
    var pid = req.params.pid;
    if (!discoveries[pid]) {
      console.log('Rejecting access for pid %s as PID is not a known discovery', pid);
      return res.status(400).send('Unknown discovery with pid: ' + pid);
    }
    fn(req, res);
  };
}


app.get('/retrievedData', function(req, res) {
  res.json(retrievedData);
  resetRetrievedData();
});


app.get('/discoveries', function(req, res) {
  res.json(discoveries);
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
