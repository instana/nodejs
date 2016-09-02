/* eslint-disable */

// This is a tiny express app which responds to all methods and has configurable
// latency and response codes. This can be used a baselines for many tests, e.g.
// to test distributed tracing.

require('../../')({
  agentPort: process.env.AGENT_PORT
});

var express = require('express');
var app = express();


app.use(function(req, res) {
  var delay = req.query.delay || 0;
  var responseStatus = req.query.status || 200;

  setTimeout(function() {
    res.sendStatus(responseStatus);
  }, delay);
});


app.listen(process.env.APP_PORT, function() {
  console.log('Express app listening on port: ' + process.env.APP_PORT);
});
