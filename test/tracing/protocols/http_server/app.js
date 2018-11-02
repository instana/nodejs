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

var app = express();
var logPrefix = 'Express HTTP: Server (' + process.pid + '):\t';

if (process.env.WITH_STDOUT) {
  app.use(morgan(logPrefix + ':method :url :status'));
}

app.use(bodyParser.json());

app.get('/', function(req, res) {
  res.sendStatus(200);
});

app.get('/blub', sendRoute);

var subRoutes = express.Router();
subRoutes.get('/bar/:id', sendRoute);
app.use('/sub', subRoutes);

var subSubRoutes = express.Router();
subSubRoutes.get('/bar/:id', sendRoute);
subRoutes.use('/sub', subSubRoutes);

function sendRoute(req, res) {
  res.send(req.baseUrl + req.route.path);
}

app.listen(process.env.APP_PORT, function() {
  log('Listening on port: ' + process.env.APP_PORT);
});

function log() {
  var args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
