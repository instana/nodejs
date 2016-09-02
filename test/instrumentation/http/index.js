'use strict';

require('../../../')({
  level: 'debug',
  agentPort: process.env.AGENT_PORT || 40699
});
var express = require('express');
var app = express();

app.get('/', function root(req, res) {
  if (Math.random() > 0.5) {
    setTimeout(function() {
      res.send('Hello World!');
    }, (Math.random() + 0.3) * 3000);
  } else {
    res.send('Hello World!');
  }
});

var server = app.listen(3211, function onListen() {
  var host = server.address().address;
  var port = server.address().port;

  console.log('Example app listening at http://%s:%s', host, port);
});
